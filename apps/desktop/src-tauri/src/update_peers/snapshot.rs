//! Hold an open verified file and its in-memory block digests, never an installer-sized upload buffer.
use super::{Error, Result, MAX_PACKAGE_BYTES};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs::File,
    io::{Read, Seek, SeekFrom},
    path::Path,
    sync::{Arc, Mutex},
};

pub(super) const BLOCK_BYTES: usize = 512 * 1024;
pub(super) const MAX_REQUESTS: usize = 8;

fn legacy_window() -> usize {
    1
}

#[derive(Clone, Deserialize, Serialize)]
pub(super) struct Manifest {
    pub size: usize,
    pub hashes: Vec<String>,
    #[serde(default = "legacy_window", rename = "requestWindow")]
    pub request_window: usize,
}

impl Manifest {
    pub fn validate(&self) -> Result<()> {
        if self.size == 0
            || self.size > MAX_PACKAGE_BYTES
            || self.hashes.len() != self.size.div_ceil(BLOCK_BYTES)
            || !self.hashes.iter().all(|hash| super::cache::valid_id(hash))
        {
            return Err(Error::Invalid);
        }
        Ok(())
    }

    pub fn length(&self, index: usize) -> Result<usize> {
        if index >= self.hashes.len() {
            return Err(Error::Invalid);
        }
        Ok(BLOCK_BYTES.min(self.size - index * BLOCK_BYTES))
    }

    pub fn verify(&self, index: usize, bytes: &[u8]) -> Result<()> {
        if bytes.len() != self.length(index)? || digest(bytes) != self.hashes[index] {
            return Err(Error::Invalid);
        }
        Ok(())
    }
}

pub(super) fn digest(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

pub(super) struct Snapshot {
    pub manifest: Manifest,
    file: Mutex<File>,
}

impl Snapshot {
    /// Called only after authenticating the complete package against upstream metadata.
    pub fn new(path: &Path, bytes: &[u8]) -> Result<Arc<Self>> {
        let file = File::open(path)?;
        if file.metadata()?.len() != bytes.len() as u64 {
            return Err(Error::Invalid);
        }
        Ok(Arc::new(Self {
            manifest: Manifest {
                size: bytes.len(),
                hashes: bytes.chunks(BLOCK_BYTES).map(digest).collect(),
                request_window: MAX_REQUESTS,
            },
            file: Mutex::new(file),
        }))
    }

    pub async fn block(self: &Arc<Self>, index: usize) -> Result<Vec<u8>> {
        let snapshot = self.clone();
        tokio::task::spawn_blocking(move || {
            let mut bytes = vec![0; snapshot.manifest.length(index)?];
            let mut file = snapshot.file.lock().map_err(|_| Error::Unavailable)?;
            file.seek(SeekFrom::Start((index * BLOCK_BYTES) as u64))?;
            file.read_exact(&mut bytes)?;
            drop(file);
            // Detect local modification after initial verification, including same-size writes.
            snapshot.manifest.verify(index, &bytes)?;
            Ok(bytes)
        })
        .await
        .map_err(|_| Error::Unavailable)?
    }
}
