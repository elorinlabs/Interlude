use super::archive_progress::{ArchivePhase, ArchiveProgress, Reporter};
use super::{paths, tree, Error, Result};
use std::{
    fs::File,
    io::{Read, Write},
    path::Path,
};
use zip::{write::SimpleFileOptions, CompressionMethod, ZipWriter};

const COPY_BUFFER_BYTES: usize = 64 * 1024;

/// Build in a private temporary file; returning or failing releases it without touching the project.
pub(crate) fn create(root: &Path, source: &str, max_bytes: u64) -> Result<(File, String)> {
    create_with_progress(root, source, max_bytes, &mut |_| true)
}

pub(crate) fn create_with_progress(
    root: &Path,
    source: &str,
    max_bytes: u64,
    report: &mut dyn FnMut(&ArchiveProgress) -> bool,
) -> Result<(File, String)> {
    let mut reporter = Reporter {
        progress: ArchiveProgress::default(),
        report,
    };
    reporter.publish()?;
    let path = paths::resolve(root, source)?;
    if !path.is_dir() {
        return Err(Error::Path);
    }
    let entries = tree::scan_checked(&path, &mut || reporter.publish())?;
    let total = entries
        .iter()
        .filter(|entry| !entry.directory)
        .try_fold(0u64, |total, entry| total.checked_add(entry.size))
        .ok_or(Error::TooLarge)?;
    if total > max_bytes {
        return Err(Error::TooLarge);
    }
    reporter.progress.total_bytes = total;
    reporter.progress.total_files = entries.iter().filter(|entry| !entry.directory).count();
    reporter.progress.phase = ArchivePhase::Compressing;
    reporter.publish()?;
    let name = path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or(Error::Name)?;
    let file = write_entries(root, &path, entries, &mut reporter)?;
    if file.metadata().map_err(|_| Error::Operation)?.len() > max_bytes {
        return Err(Error::TooLarge);
    }
    Ok((file, format!("{name}.zip")))
}

fn write_entries(
    root: &Path,
    path: &Path,
    entries: Vec<tree::Entry>,
    reporter: &mut Reporter<'_>,
) -> Result<File> {
    let parent = path.parent().ok_or(Error::Path)?;
    let mut archive = ZipWriter::new(tempfile::tempfile().map_err(|_| Error::Operation)?);
    let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
    for entry in entries {
        reporter.publish()?;
        paths::resolve(root, &super::execution_path(&entry.path))?;
        let relative = archive_name(parent, &entry.path)?;
        if entry.directory {
            archive
                .add_directory(format!("{relative}/"), options)
                .map_err(|_| Error::Operation)?;
        } else {
            archive
                .start_file(&relative, options.large_file(entry.size > u32::MAX as u64))
                .map_err(|_| Error::Operation)?;
            write_file(&mut archive, &entry, reporter)?;
        }
    }
    reporter.progress.phase = ArchivePhase::Finalizing;
    reporter.publish()?;
    archive.finish().map_err(|_| Error::Operation)
}

fn archive_name(parent: &Path, path: &Path) -> Result<String> {
    path.strip_prefix(parent)
        .map_err(|_| Error::Path)?
        .components()
        .map(|part| {
            let name = part.as_os_str().to_str().ok_or(Error::Name)?;
            // A literal Unix backslash could become traversal when extracted on Windows.
            if name.contains('\\') {
                return Err(Error::Name);
            }
            Ok(name)
        })
        .collect::<Result<Vec<_>>>()
        .map(|parts| parts.join("/"))
}

fn write_file(
    archive: &mut ZipWriter<File>,
    entry: &tree::Entry,
    reporter: &mut Reporter<'_>,
) -> Result<()> {
    if std::fs::symlink_metadata(&entry.path)
        .map_err(|_| Error::Operation)?
        .file_type()
        .is_symlink()
    {
        return Err(Error::Link);
    }
    let mut source = File::open(&entry.path)
        .map_err(|_| Error::Operation)?
        .take(entry.size.saturating_add(1));
    let mut copied = 0;
    let mut buffer = [0; COPY_BUFFER_BYTES];
    loop {
        reporter.publish()?;
        let length = source.read(&mut buffer).map_err(|_| Error::Operation)?;
        if length == 0 {
            break;
        }
        copied += length as u64;
        if copied > entry.size {
            return Err(Error::Operation);
        }
        archive
            .write_all(&buffer[..length])
            .map_err(|_| Error::Operation)?;
        reporter.progress.processed_bytes += length as u64;
    }
    if copied != entry.size {
        return Err(Error::Operation);
    }
    reporter.progress.completed_files += 1;
    reporter.publish()?;
    Ok(())
}
