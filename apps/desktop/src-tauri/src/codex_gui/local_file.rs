//! Local file access for authenticated previews and downloads. The chat directory resolves
//! relative paths; it is not a boundary for files the user opens on the connected computer.
use std::path::{Path, PathBuf};

use super::error::{GuiError, Result};

pub(super) fn validate(source: &str) -> Result<()> {
    let normalized = source.replace('\\', "/");
    let without_drive = if normalized.as_bytes().get(1) == Some(&b':')
        && normalized.as_bytes()[0].is_ascii_alphabetic()
        && normalized.as_bytes().get(2) == Some(&b'/')
    {
        &normalized[2..]
    } else {
        &normalized
    };
    if source.is_empty()
        || source.len() > 4096
        || source.chars().any(char::is_control)
        || normalized.starts_with("//")
        || without_drive.contains(':')
    {
        return Err(GuiError::FileRead);
    }
    Ok(())
}

pub(super) fn resolve(root: &Path, source: &str) -> Result<PathBuf> {
    validate(source)?;
    if !root.is_absolute() {
        return Err(GuiError::FileRead);
    }
    let path = root
        .join(source)
        .canonicalize()
        .map_err(|_| GuiError::FileRead)?;
    // A local symlink must not turn this operation into a network-share or device read.
    #[cfg(windows)]
    if !matches!(path.components().next(), Some(std::path::Component::Prefix(prefix))
        if matches!(prefix.kind(), std::path::Prefix::Disk(_) | std::path::Prefix::VerbatimDisk(_)))
    {
        return Err(GuiError::FileRead);
    }
    if !path.is_file() {
        return Err(GuiError::FileRead);
    }
    Ok(path)
}
