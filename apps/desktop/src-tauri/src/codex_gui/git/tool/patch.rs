//! Complete, binary-safe patches stream into private temporary files for the download manager.
use super::super::{command, directory, repository};
use super::{revision, GitError, Result};
use std::{fs::File, io::Read, path::Path, process::Stdio};

const PATCH_ARGUMENTS: &[&str] = &[
    "--no-pager",
    "show",
    "--format=",
    "--first-parent",
    "--root",
    "--binary",
    "--full-index",
    "--no-renames",
    "--no-ext-diff",
    "--no-textconv",
    "--no-color",
    "--src-prefix=a/",
    "--dst-prefix=b/",
];

pub(in crate::codex_gui) fn create(cwd: &str, hash: &str, max_bytes: u64) -> Result<File> {
    let root = repository(&directory(cwd)?)?;
    revision::validate_commit(&root, hash)?;
    let mut file = tempfile::tempfile().map_err(|_| GitError::Operation)?;
    write_patch(&root, hash, max_bytes, &mut file)?;
    Ok(file)
}

fn write_patch(root: &Path, hash: &str, limit: u64, file: &mut File) -> Result<()> {
    let mut child = command(root)
        .args(PATCH_ARGUMENTS)
        .args([hash, "--"])
        .stdin(Stdio::null())
        .stderr(Stdio::null())
        .stdout(Stdio::piped())
        .spawn()
        .map_err(|_| GitError::Unavailable)?;
    let copied = child
        .stdout
        .take()
        .ok_or(GitError::Operation)
        .and_then(|output| {
            std::io::copy(&mut output.take(limit.saturating_add(1)), file)
                .map_err(|_| GitError::Operation)
        });
    let oversized = copied.as_ref().is_ok_and(|bytes| *bytes > limit);
    if oversized || copied.is_err() {
        // Git may have exited after filling its pipe; wait below always reaps it.
        if let Err(error) = child.kill() {
            eprintln!("Git patch cleanup: {error}");
        }
    }
    let status = child.wait().map_err(|_| GitError::Operation)?;
    copied?;
    if oversized {
        return Err(GitError::PatchTooLarge);
    }
    if !status.success() {
        return Err(GitError::Operation);
    }
    Ok(())
}
