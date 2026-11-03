//! Lightweight metadata for explicitly selected, validated local files and folders.
use super::{FileError, Result};
use serde::Serialize;
use std::{path::Path, time::UNIX_EPOCH};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct FileMetadata {
    name: String,
    path: String,
    directory: bool,
    size: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    modified_at: Option<u64>,
}

/// Called from the file action worker after the existing path validation and resolution.
pub(super) fn read(path: &Path) -> Result<FileMetadata> {
    let metadata = path.metadata().map_err(|_| FileError::Missing)?;
    if !metadata.is_file() && !metadata.is_dir() {
        return Err(FileError::Path);
    }
    // Directory sizes would require a recursive scan; report only ordinary file lengths.
    Ok(FileMetadata {
        name: path
            .file_name()
            .ok_or(FileError::Path)?
            .to_string_lossy()
            .into_owned(),
        path: super::super::platform::execution_path(path),
        directory: metadata.is_dir(),
        size: metadata.is_file().then_some(metadata.len()),
        modified_at: metadata
            .modified()
            .ok()
            .and_then(|value| value.duration_since(UNIX_EPOCH).ok())
            .and_then(|value| u64::try_from(value.as_millis()).ok()),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reports_exact_size_for_empty_and_binary_files_without_reading_contents() {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("诊断日志.bin");
        for bytes in [vec![], vec![0, 255, 128, 1]] {
            std::fs::write(&path, &bytes).unwrap();
            let info = read(&path).unwrap();
            assert_eq!(info.name, "诊断日志.bin");
            assert_eq!(info.size, Some(bytes.len() as u64));
            assert!(!info.directory);
            assert!(info.modified_at.is_some());
        }
        let folder = read(root.path()).unwrap();
        assert!(folder.directory);
        assert_eq!(folder.size, None);
        assert!(read(&root.path().join("missing.txt")).is_err());
    }
}
