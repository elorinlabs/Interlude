//! Upload limits owned by the authenticated coordinator and read only on worker threads.
use serde::Deserialize;
use std::sync::Mutex;

#[derive(Debug, thiserror::Error)]
pub(crate) enum UploadPolicyError {
    #[error("Invalid upload policy")]
    Invalid,
    #[error("Upload policy unavailable")]
    Unavailable,
}
type Result<T> = std::result::Result<T, UploadPolicyError>;

const MIB: u64 = 1024 * 1024;
const MAX_SAFE_INTEGER: u64 = 9_007_199_254_740_991;
const MESSAGE_RESERVE_BYTES: usize = 4 * 1024 * 1024;
const DEFAULT_MESSAGE_BYTES: usize = 8 * 1024 * 1024;

/// Provenance assigned by the desktop chat host, retained while a message waits in the queue.
#[derive(Clone, Copy, Debug, Default, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) enum TransferMode {
    Direct,
    #[default]
    Relay,
}

impl TransferMode {
    pub(super) fn is_direct(self) -> bool {
        self == Self::Direct
    }
}

#[derive(Clone, Copy, Debug)]
pub(crate) struct UploadLimits {
    pub(super) file_bytes: usize,
    pub(super) total_bytes: usize,
}

impl Default for UploadLimits {
    fn default() -> Self {
        Self {
            file_bytes: 2 * MIB as usize,
            total_bytes: 3 * MIB as usize,
        }
    }
}

impl UploadLimits {
    pub(super) fn encoded_total(self, count: usize) -> usize {
        self.total_bytes
            .div_ceil(3)
            .saturating_mul(4)
            .saturating_add(count.saturating_mul(4))
    }

    pub(crate) fn message_bytes(self) -> usize {
        self.encoded_total(0)
            .saturating_add(MESSAGE_RESERVE_BYTES)
            .max(DEFAULT_MESSAGE_BYTES)
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Policy {
    #[serde(default = "default_file_mb")]
    file_upload_max_mb: u64,
    #[serde(default = "default_total_mb")]
    file_upload_total_max_mb: u64,
}

fn default_file_mb() -> u64 {
    2
}
fn default_total_mb() -> u64 {
    3
}

fn byte_limit(value: u64) -> Result<usize> {
    if value == 0 || value > MAX_SAFE_INTEGER {
        return Err(UploadPolicyError::Invalid);
    }
    Ok(value
        .saturating_mul(MIB)
        .min(MAX_SAFE_INTEGER)
        .min(usize::MAX as u64) as usize)
}

/// Shared by native chat registration, GUI upload workers and the authenticated hosted HTTP worker.
#[derive(Default)]
pub(crate) struct UploadPolicyStore(Mutex<UploadLimits>);

impl UploadPolicyStore {
    pub(crate) fn snapshot(&self) -> Result<UploadLimits> {
        self.0
            .lock()
            .map(|limits| *limits)
            .map_err(|_| UploadPolicyError::Unavailable)
    }

    /// Only call with a policy received on the coordinator's authenticated WebSocket.
    pub(crate) fn update(&self, value: &serde_json::Value) -> Result<()> {
        let policy: Policy =
            serde_json::from_value(value.clone()).map_err(|_| UploadPolicyError::Invalid)?;
        let limits = UploadLimits {
            file_bytes: byte_limit(policy.file_upload_max_mb)?,
            total_bytes: byte_limit(policy.file_upload_total_max_mb)?,
        };
        *self.0.lock().map_err(|_| UploadPolicyError::Unavailable)? = limits;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn defaults_older_policies_and_rejects_invalid_updates_without_losing_current_limits() {
        let store = UploadPolicyStore::default();
        store.update(&json!({})).unwrap();
        assert_eq!(store.snapshot().unwrap().file_bytes, 2 * MIB as usize);
        store
            .update(&json!({"fileUploadMaxMb": 20, "fileUploadTotalMaxMb": 50}))
            .unwrap();
        let saved = store.snapshot().unwrap();
        assert_eq!(saved.file_bytes, 20 * MIB as usize);
        assert_eq!(saved.total_bytes, 50 * MIB as usize);
        assert!(saved.message_bytes() > 50 * MIB as usize);
        for invalid in [
            json!(null),
            json!(0),
            json!(-1),
            json!(1.5),
            json!("20"),
            json!(MAX_SAFE_INTEGER + 1),
        ] {
            for key in ["fileUploadMaxMb", "fileUploadTotalMaxMb"] {
                assert!(store.update(&json!({(key): invalid})).is_err());
                assert_eq!(store.snapshot().unwrap().total_bytes, saved.total_bytes);
            }
        }
    }
}
