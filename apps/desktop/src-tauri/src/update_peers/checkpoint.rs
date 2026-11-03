//! Partial packages are private download state. Only the existing whole-package verifier can publish them.
use super::{
    snapshot::{digest, BLOCK_BYTES},
    Error, Result,
};
use serde::{Deserialize, Serialize};
use std::{
    fs::{self, File, OpenOptions},
    io::{Read, Seek, SeekFrom, Write},
    path::PathBuf,
    sync::{Arc, Mutex},
};

const MAX_LEDGER_BYTES: u64 = 128 * 1024;

#[derive(Deserialize, Serialize)]
struct Ledger {
    size: usize,
    hashes: Vec<Option<String>>,
}
struct Files {
    file: File,
    ledger: Ledger,
}

pub(super) struct Checkpoint {
    path: PathBuf,
    ledger_path: PathBuf,
    files: Mutex<Files>,
}

impl Checkpoint {
    pub async fn open(
        directory: PathBuf,
        id: String,
        size: usize,
    ) -> Result<(Arc<Self>, Vec<bool>)> {
        tokio::task::spawn_blocking(move || {
            if !super::cache::valid_id(&id) || size == 0 || size > super::MAX_PACKAGE_BYTES {
                return Err(Error::Invalid);
            }
            fs::create_dir_all(&directory)?;
            let path = directory.join(format!("{id}.partial"));
            let ledger_path = directory.join(format!("{id}.json"));
            prune(&directory, &id)?;
            if fs::symlink_metadata(&path).is_ok_and(|info| !info.is_file()) {
                return Err(Error::Invalid);
            }
            let mut file = OpenOptions::new()
                .read(true)
                .write(true)
                .create(true)
                .truncate(false)
                .open(&path)?;
            let mut ledger = read_ledger(&ledger_path, size);
            restore(&mut file, &mut ledger)?;
            file.set_len(size as u64)?;
            let done = ledger.hashes.iter().map(Option::is_some).collect();
            Ok((
                Arc::new(Self {
                    path,
                    ledger_path,
                    files: Mutex::new(Files { file, ledger }),
                }),
                done,
            ))
        })
        .await
        .map_err(|_| Error::Unavailable)?
    }

    pub async fn write(self: &Arc<Self>, index: usize, bytes: Vec<u8>) -> Result<()> {
        let checkpoint = self.clone();
        tokio::task::spawn_blocking(move || {
            let mut files = checkpoint.files.lock().map_err(|_| Error::Unavailable)?;
            if index >= files.ledger.hashes.len()
                || bytes.len() != BLOCK_BYTES.min(files.ledger.size - index * BLOCK_BYTES)
            {
                return Err(Error::Invalid);
            }
            files
                .file
                .seek(SeekFrom::Start((index * BLOCK_BYTES) as u64))?;
            files.file.write_all(&bytes)?;
            files.file.sync_data()?;
            files.ledger.hashes[index] = Some(digest(&bytes));
            let data = serde_json::to_vec(&files.ledger).map_err(|_| Error::Invalid)?;
            let mut temporary =
                tempfile::NamedTempFile::new_in(checkpoint.path.parent().ok_or(Error::Invalid)?)?;
            temporary.write_all(&data)?;
            temporary.as_file().sync_all()?;
            temporary
                .persist(&checkpoint.ledger_path)
                .map_err(|error| error.error)?;
            Ok(())
        })
        .await
        .map_err(|_| Error::Unavailable)?
    }

    pub async fn finish(self: Arc<Self>, size: usize) -> Result<Vec<u8>> {
        tokio::task::spawn_blocking(move || {
            let mut files = self.files.lock().map_err(|_| Error::Unavailable)?;
            files.file.seek(SeekFrom::Start(0))?;
            let mut bytes = vec![0; size];
            files.file.read_exact(&mut bytes)?;
            // Never keep a completed-but-unverified checkpoint after a signature failure.
            remove(&self.ledger_path)?;
            remove(&self.path)?;
            Ok(bytes)
        })
        .await
        .map_err(|_| Error::Unavailable)?
    }
}

fn read_ledger(path: &std::path::Path, size: usize) -> Ledger {
    let loaded = (|| {
        let metadata = fs::symlink_metadata(path).ok()?;
        if !metadata.is_file() || metadata.len() > MAX_LEDGER_BYTES {
            return None;
        }
        let ledger: Ledger = serde_json::from_slice(&fs::read(path).ok()?).ok()?;
        (ledger.size == size && ledger.hashes.len() == size.div_ceil(BLOCK_BYTES)).then_some(ledger)
    })();
    loaded.unwrap_or_else(|| Ledger {
        size,
        hashes: vec![None; size.div_ceil(BLOCK_BYTES)],
    })
}

fn restore(file: &mut File, ledger: &mut Ledger) -> Result<()> {
    if file.metadata()?.len() != ledger.size as u64 {
        ledger.hashes.fill(None);
        return Ok(());
    }
    for (index, hash) in ledger.hashes.iter_mut().enumerate() {
        let Some(expected) = hash.as_ref() else {
            continue;
        };
        let mut bytes = vec![0; BLOCK_BYTES.min(ledger.size - index * BLOCK_BYTES)];
        file.seek(SeekFrom::Start((index * BLOCK_BYTES) as u64))?;
        file.read_exact(&mut bytes)?;
        if digest(&bytes) != *expected {
            *hash = None;
        }
    }
    Ok(())
}

fn remove(path: &std::path::Path) -> Result<()> {
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.into()),
    }
}

fn prune(directory: &std::path::Path, current: &str) -> Result<()> {
    let mut entries = fs::read_dir(directory)?
        .filter_map(std::result::Result::ok)
        .filter(|entry| {
            entry
                .path()
                .extension()
                .is_some_and(|extension| extension == "partial")
        })
        .filter(|entry| {
            entry
                .path()
                .file_stem()
                .and_then(|id| id.to_str())
                .is_some_and(|id| id != current && super::cache::valid_id(id))
        })
        .collect::<Vec<_>>();
    entries
        .sort_by_key(|entry| std::cmp::Reverse(entry.metadata().and_then(|m| m.modified()).ok()));
    // Keep the current download and at most one other interrupted package.
    for entry in entries.into_iter().skip(1) {
        remove(&entry.path().with_extension("json"))?;
        remove(&entry.path())?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn resumes_verified_blocks_and_rejects_partial_file_corruption() {
        let root = tempfile::tempdir().unwrap();
        let id = "a".repeat(64);
        let (checkpoint, done) = Checkpoint::open(root.path().into(), id.clone(), BLOCK_BYTES + 3)
            .await
            .unwrap();
        assert_eq!(done, [false, false]);
        checkpoint.write(0, vec![7; BLOCK_BYTES]).await.unwrap();
        drop(checkpoint);
        let (checkpoint, done) = Checkpoint::open(root.path().into(), id.clone(), BLOCK_BYTES + 3)
            .await
            .unwrap();
        assert_eq!(done, [true, false]);
        checkpoint.write(1, vec![8; 3]).await.unwrap();
        drop(checkpoint);
        let mut file = OpenOptions::new()
            .write(true)
            .open(root.path().join(format!("{id}.partial")))
            .unwrap();
        file.write_all(&[0]).unwrap();
        let (checkpoint, done) = Checkpoint::open(root.path().into(), id, BLOCK_BYTES + 3)
            .await
            .unwrap();
        assert_eq!(done, [false, true]);
        checkpoint.write(0, vec![7; BLOCK_BYTES]).await.unwrap();
        assert_eq!(
            checkpoint.finish(BLOCK_BYTES + 3).await.unwrap().len(),
            BLOCK_BYTES + 3
        );
    }
}
