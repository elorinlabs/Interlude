//! Windows file promises: names travel at copy time; bytes are requested by Explorer at paste time.
#[cfg(windows)]
mod broker;
#[cfg(windows)]
mod data_object;
#[cfg(windows)]
pub(super) mod host;
pub(crate) mod local;
#[cfg(windows)]
mod publisher;
#[cfg(windows)]
mod sources;
#[cfg(windows)]
mod stream;

#[cfg(windows)]
use super::clipboard::MAX_BYTES;
use super::clipboard::{ClipboardError, ClipboardResult};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

#[cfg(windows)]
pub(super) use broker::{answer, cancel, remote_reader};
#[cfg(windows)]
pub(super) use publisher::{publish, published};
#[cfg(windows)]
pub(super) use sources::{capture, read, release};

#[derive(Clone, Debug, Deserialize, Serialize)]
pub(crate) struct FileInfo {
    pub name: String,
    pub size: u64,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub(crate) struct Offer {
    pub id: String,
    pub files: Vec<FileInfo>,
}

#[cfg(windows)]
impl Offer {
    pub(super) fn validate(&self) -> ClipboardResult<()> {
        if uuid::Uuid::parse_str(&self.id).is_err()
            || self.files.is_empty()
            || self.files.len() > super::clipboard_files::MAX_FILES
        {
            return Err(ClipboardError::Invalid);
        }
        let mut names = std::collections::HashSet::new();
        let mut total = 0u64;
        for file in &self.files {
            if !super::clipboard_files::valid_name(&file.name)
                || !names.insert(file.name.to_lowercase())
            {
                return Err(ClipboardError::Invalid);
            }
            total = total.checked_add(file.size).ok_or(ClipboardError::Size)?;
        }
        if total > MAX_BYTES as u64 {
            return Err(ClipboardError::Size);
        }
        Ok(())
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ReadRequest {
    pub offer_id: String,
    pub index: usize,
    pub offset: u64,
    pub length: usize,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ReadEvent {
    pub kind: &'static str,
    pub request_id: String,
    #[serde(flatten)]
    pub request: ReadRequest,
}

#[cfg(windows)]
pub(super) type Reader = Arc<dyn Fn(ReadRequest) -> ClipboardResult<Vec<u8>> + Send + Sync>;
pub(super) type Sender = Arc<dyn Fn(ReadEvent) -> ClipboardResult<()> + Send + Sync>;

#[cfg(all(test, windows))]
mod shell_test;
#[cfg(all(test, windows))]
mod tests;
