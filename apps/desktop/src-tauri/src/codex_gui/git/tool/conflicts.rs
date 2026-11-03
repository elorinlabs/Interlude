//! Text conflict snapshots and explicit resolutions. Never follow links or resolve stale content.
use super::super::{command, run};
use super::{commit, file_actions, integration, validate_path, GitError, Result};
use serde::{Deserialize, Serialize};
use sha2::Digest;
use std::{fs, io::Write, path::Path};

const MAX_TEXT_BYTES: usize = 512 * 1024;
const DEFAULT_MARKER_SIZE: usize = 7;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Conflict {
    pub path: String,
    pub version: String,
    pub base: Option<String>,
    pub ours: Option<String>,
    pub theirs: Option<String>,
    pub result: Option<String>,
    pub marker_size: usize,
}

#[derive(Deserialize)]
pub(crate) struct Resolution {
    pub path: String,
    pub version: String,
    /// None is an explicit deletion, permitted only if one side deleted the file.
    #[serde(deserialize_with = "Option::deserialize")]
    pub content: Option<String>,
}

fn text(bytes: Vec<u8>) -> Result<String> {
    if bytes.len() > MAX_TEXT_BYTES || bytes.contains(&0) {
        return Err(GitError::ConflictUnsupported);
    }
    String::from_utf8(bytes).map_err(|_| GitError::ConflictUnsupported)
}

fn worktree(root: &Path, path: &str) -> Result<Option<String>> {
    file_actions::validate_file(root, path)?;
    let target = root.join(path);
    match fs::symlink_metadata(&target) {
        Ok(meta)
            if !meta.is_file()
                || meta.file_type().is_symlink()
                || meta.len() > MAX_TEXT_BYTES as u64 =>
        {
            return Err(GitError::ConflictUnsupported)
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(_) => return Err(GitError::File),
        _ => {}
    }
    text(fs::read(target).map_err(|_| GitError::File)?).map(Some)
}

fn stages(root: &Path, path: &str) -> Result<[Option<String>; 3]> {
    let listed = command(root)
        .env("GIT_LITERAL_PATHSPECS", "1")
        .args(["ls-files", "--unmerged", "-z", "--", path])
        .output()
        .map_err(|_| GitError::Unavailable)?;
    if !listed.status.success() || listed.stdout.is_empty() {
        return Err(GitError::ConflictChanged);
    }
    let entries = String::from_utf8(listed.stdout).map_err(|_| GitError::File)?;
    let mut result = [None, None, None];
    for entry in entries.split('\0').filter(|entry| !entry.is_empty()) {
        let (metadata, name) = entry.split_once('\t').ok_or(GitError::File)?;
        let parts: Vec<_> = metadata.split(' ').collect();
        if name != path || parts.len() != 3 || !matches!(parts[0], "100644" | "100755") {
            return Err(GitError::ConflictUnsupported);
        }
        let stage: usize = parts[2].parse().map_err(|_| GitError::File)?;
        if !(1..=3).contains(&stage) {
            return Err(GitError::File);
        }
        let size = super::super::output(root, &["cat-file", "-s", parts[1]])?;
        if size.parse::<usize>().map_err(|_| GitError::File)? > MAX_TEXT_BYTES {
            return Err(GitError::ConflictUnsupported);
        }
        let blob = run(root, &["cat-file", "blob", parts[1]])?;
        if !blob.status.success() {
            return Err(GitError::File);
        }
        result[stage - 1] = Some(text(blob.stdout)?);
    }
    Ok(result)
}

fn marker_size(root: &Path, path: &str) -> Result<usize> {
    let result = run(
        root,
        &["check-attr", "-z", "conflict-marker-size", "--", path],
    )?;
    if !result.status.success() {
        return Err(GitError::File);
    }
    let value = std::str::from_utf8(&result.stdout).map_err(|_| GitError::File)?;
    Ok(value
        .split('\0')
        .nth(2)
        .and_then(|value| value.parse().ok())
        .filter(|size| (1..=MAX_TEXT_BYTES).contains(size))
        .unwrap_or(DEFAULT_MARKER_SIZE))
}

pub(super) fn read(root: &Path, path: &str) -> Result<Conflict> {
    validate_path(path)?;
    let before = integration::fingerprint(root)?;
    let result = worktree(root, path)?;
    let [base, ours, theirs] = stages(root, path)?;
    let marker_size = marker_size(root, path)?;
    let mut hash = integration::fingerprint(root)?;
    if before.finalize() != hash.clone().finalize() {
        return Err(GitError::ConflictChanged);
    }
    hash.update(path);
    hash.update(format!(
        "{result:?}:{base:?}:{ours:?}:{theirs:?}:{marker_size}"
    ));
    Ok(Conflict {
        path: path.to_owned(),
        version: format!("{:x}", hash.finalize()),
        base,
        ours,
        theirs,
        result,
        marker_size,
    })
}

fn has_markers(content: &str, size: usize) -> bool {
    ['<', '=', '>', '|'].iter().any(|marker| {
        let prefix = marker.to_string().repeat(size);
        content
            .lines()
            .any(|line| line == prefix || line.starts_with(&format!("{prefix} ")))
    })
}

fn write(root: &Path, path: &str, content: Option<&str>) -> Result<()> {
    let target = root.join(path);
    let Some(content) = content else {
        return match fs::remove_file(target) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(_) => Err(GitError::Operation),
        };
    };
    let parent = target.parent().ok_or(GitError::File)?;
    fs::create_dir_all(parent).map_err(|_| GitError::Operation)?;
    // Atomic replacement avoids truncating the old file on a failed write and avoids writing through hard links.
    let mut temporary = tempfile::NamedTempFile::new_in(parent).map_err(|_| GitError::Operation)?;
    temporary
        .write_all(content.as_bytes())
        .map_err(|_| GitError::Operation)?;
    if let Ok(meta) = fs::metadata(&target) {
        temporary
            .as_file()
            .set_permissions(meta.permissions())
            .map_err(|_| GitError::Operation)?;
    }
    temporary.persist(target).map_err(|_| GitError::Operation)?;
    Ok(())
}

pub(super) fn resolve(root: &Path, request: Resolution) -> Result<()> {
    let transaction = commit::IndexTransaction::new(root)?;
    let current = read(root, &request.path)?;
    if current.version != request.version {
        return Err(GitError::ConflictChanged);
    }
    if let Some(content) = &request.content {
        if content.len() > MAX_TEXT_BYTES || content.contains('\0') {
            return Err(GitError::ConflictUnsupported);
        }
        if has_markers(content, current.marker_size) {
            return Err(GitError::ConflictMarkers);
        }
    } else if current.ours.is_some() && current.theirs.is_some() {
        return Err(GitError::File);
    }
    write(root, &request.path, request.content.as_deref())?;
    let staged = commit::stage(&transaction, root, std::slice::from_ref(&request.path))
        .and_then(|()| transaction.publish());
    if staged.is_err() {
        // Restore the previous working copy when filters or staging fail; retain the real index unchanged.
        write(root, &request.path, current.result.as_deref())?;
    }
    staged
}
