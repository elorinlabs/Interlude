use super::{Error, Result};
use std::{
    fs,
    path::{Path, PathBuf},
};

const MAX_ENTRIES: usize = 100_000;

pub(super) struct Entry {
    pub path: PathBuf,
    pub directory: bool,
    pub size: u64,
}

/// Plan the complete tree first; never follow links or partly copy an unsupported tree.
pub(super) fn scan(source: &Path) -> Result<Vec<Entry>> {
    scan_checked(source, &mut || Ok(()))
}

pub(super) fn scan_checked(
    source: &Path,
    check: &mut dyn FnMut() -> Result<()>,
) -> Result<Vec<Entry>> {
    let mut entries = Vec::new();
    let mut pending = vec![source.to_owned()];
    while let Some(path) = pending.pop() {
        check()?;
        if entries.len() + pending.len() >= MAX_ENTRIES {
            return Err(Error::TooMany);
        }
        let metadata = fs::symlink_metadata(&path).map_err(|_| Error::Operation)?;
        if metadata.file_type().is_symlink() || (!metadata.is_dir() && !metadata.is_file()) {
            return Err(Error::Link);
        }
        if metadata.is_dir() {
            let mut children = Vec::new();
            for child in fs::read_dir(&path).map_err(|_| Error::Operation)? {
                check()?;
                if entries.len() + pending.len() + children.len() + 1 >= MAX_ENTRIES {
                    return Err(Error::TooMany);
                }
                children.push(child.map_err(|_| Error::Operation)?.path());
            }
            children.sort();
            pending.extend(children.into_iter().rev());
        }
        entries.push(Entry {
            path,
            directory: metadata.is_dir(),
            size: metadata.len(),
        });
    }
    Ok(entries)
}

pub(super) fn copy(source: &Path, destination: &Path) -> Result<()> {
    let entries = scan(source)?;
    let parent = destination.parent().ok_or(Error::Path)?;
    let staging = tempfile::tempdir_in(parent).map_err(|_| Error::Operation)?;
    let staged = staging.path().join("entry");
    for entry in entries {
        super::paths::resolve(source, &super::execution_path(&entry.path))?;
        let relative = entry.path.strip_prefix(source).map_err(|_| Error::Path)?;
        let target = staged.join(relative);
        if entry.directory {
            fs::create_dir(&target).map_err(|_| Error::Operation)?;
        } else {
            fs::copy(&entry.path, &target).map_err(|_| Error::Operation)?;
        }
    }
    super::paths::require_missing(destination)?;
    fs::rename(staged, destination).map_err(|_| Error::Operation)
}
