use super::{Error, Result};
use std::{
    fs,
    path::{Component, Path, PathBuf},
};

pub(super) fn root(cwd: &str) -> Result<PathBuf> {
    super::super::local_file::validate(cwd).map_err(|_| Error::Path)?;
    let path = Path::new(cwd);
    if !path.is_absolute() {
        return Err(Error::Path);
    }
    let root = path.canonicalize().map_err(|_| Error::Path)?;
    if !root.is_dir() {
        return Err(Error::Path);
    }
    Ok(root)
}

/// Reject links before resolving, including links in ancestors, so mutations stay in this project.
pub(super) fn resolve(root: &Path, source: &str) -> Result<PathBuf> {
    super::super::local_file::validate(source).map_err(|_| Error::Path)?;
    let candidate = root.join(source);
    if candidate
        .components()
        .any(|part| matches!(part, Component::ParentDir))
    {
        return Err(Error::Path);
    }
    let path = candidate.canonicalize().map_err(|_| Error::Path)?;
    if !path.starts_with(root) || (!path.is_dir() && !path.is_file()) {
        return Err(Error::Path);
    }
    let mut ancestor = Some(candidate.as_path());
    while let Some(current) = ancestor {
        let metadata = fs::symlink_metadata(current).map_err(|_| Error::Path)?;
        if metadata.file_type().is_symlink() {
            return Err(Error::Link);
        }
        // System aliases above the selected project (for example macOS /var) are allowed.
        if current.canonicalize().map_err(|_| Error::Path)? == root {
            break;
        }
        ancestor = current.parent();
    }
    Ok(path)
}

pub(super) fn child(parent: &Path, name: &str) -> Result<PathBuf> {
    let stem = name
        .split('.')
        .next()
        .unwrap_or_default()
        .to_ascii_uppercase();
    let reserved = ["CON", "PRN", "AUX", "NUL", "CONIN$", "CONOUT$"].contains(&stem.as_str())
        || ((stem.starts_with("COM") || stem.starts_with("LPT"))
            && stem.len() == 4
            && stem.as_bytes()[3].is_ascii_digit());
    if name.is_empty()
        || name.len() > 255
        || name == "."
        || name == ".."
        || name.ends_with(['.', ' '])
        || reserved
        || name
            .chars()
            .any(|c| c.is_control() || r#"\/:*?"<>|"#.contains(c))
    {
        return Err(Error::Name);
    }
    if !parent.is_dir() {
        return Err(Error::Path);
    }
    Ok(parent.join(name))
}

pub(super) fn require_missing(path: &Path) -> Result<()> {
    match fs::symlink_metadata(path) {
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Ok(_) => Err(Error::Exists),
        Err(_) => Err(Error::Operation),
    }
}

pub(super) fn copy_destination(source: &Path, parent: &Path) -> Result<PathBuf> {
    let name = source
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or(Error::Name)?;
    let destination = child(parent, name)?;
    if require_missing(&destination).is_ok() {
        return Ok(destination);
    }
    let extension = if source.is_file() {
        source.extension().and_then(|value| value.to_str())
    } else {
        None
    };
    let stem = extension
        .and_then(|_| source.file_stem())
        .and_then(|value| value.to_str())
        .unwrap_or(name);
    for index in 1..=1000 {
        let suffix = if index == 1 {
            " (copy)".to_owned()
        } else {
            format!(" (copy {index})")
        };
        let name = match extension {
            Some(extension) => format!("{stem}{suffix}.{extension}"),
            None => format!("{stem}{suffix}"),
        };
        let candidate = child(parent, &name)?;
        if require_missing(&candidate).is_ok() {
            return Ok(candidate);
        }
    }
    Err(Error::Exists)
}
