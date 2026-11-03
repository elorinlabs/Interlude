//! Read-only compatibility with old .cs account backups. New backups never use this embedded key.
use aes_gcm::{
    aead::{Aead, Payload},
    Aes256Gcm, KeyInit, Nonce,
};
use flate2::read::GzDecoder;
use serde_json::Value;
use std::{fs::File, io::Read, path::Path};
use zeroize::Zeroizing;

const MAGIC: &[u8] = b"CSARCHIVE1";
const KEY: [u8; 32] = *b"CodexSwitchLocalBackupKeyV1!2026";
const MAX_BYTES: u64 = 64 * 1024 * 1024;

pub(super) fn read(path: &Path) -> Result<Value, String> {
    let file = File::open(path).map_err(|_| "folderSyncMissing")?;
    if file.metadata().map_err(|_| "folderSyncIo")?.len() > MAX_BYTES {
        return Err("folderSyncFormat".into());
    }
    let mut zip = zip::ZipArchive::new(file).map_err(|_| "folderSyncFormat")?;
    let payload = zip
        .by_name("accounts.payload")
        .map_err(|_| "folderSyncFormat")?;
    if payload.size() > MAX_BYTES {
        return Err("folderSyncFormat".into());
    }
    let mut encrypted = Vec::new();
    payload
        .take(MAX_BYTES + 1)
        .read_to_end(&mut encrypted)
        .map_err(|_| "folderSyncIo")?;
    if encrypted.len() as u64 > MAX_BYTES
        || encrypted.len() <= MAGIC.len() + 12
        || !encrypted.starts_with(MAGIC)
    {
        return Err("folderSyncFormat".into());
    }
    let offset = MAGIC.len();
    let cipher = Aes256Gcm::new_from_slice(&KEY).map_err(|_| "folderSyncFormat")?;
    let compressed = Zeroizing::new(
        cipher
            .decrypt(
                Nonce::from_slice(&encrypted[offset..offset + 12]),
                Payload {
                    msg: &encrypted[offset + 12..],
                    aad: MAGIC,
                },
            )
            .map_err(|_| "folderSyncFormat")?,
    );
    let mut json = Zeroizing::new(Vec::new());
    GzDecoder::new(&compressed[..])
        .take(MAX_BYTES + 1)
        .read_to_end(&mut json)
        .map_err(|_| "folderSyncFormat")?;
    if json.len() as u64 > MAX_BYTES {
        return Err("folderSyncFormat".into());
    }
    serde_json::from_slice(&json).map_err(|_| "folderSyncFormat".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn old_account_and_private_details_are_read_without_a_legacy_writer() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("old.cs");
        std::fs::write(&path, include_bytes!("fixtures/legacy.cs")).unwrap();
        let payload = read(&path).unwrap();
        assert_eq!(payload["formatVersion"], 5);
        assert_eq!(payload["accounts"][0]["note"], "synthetic legacy fixture");
        assert_eq!(
            payload["accounts"][0]["privateDetails"]["password"],
            "synthetic-old-password"
        );
        assert!(payload["providers"].is_array());
    }
    #[test]
    fn a_corrupt_archive_is_rejected() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("broken.cs");
        std::fs::write(&path, b"not a zip").unwrap();
        assert!(read(&path).is_err());
    }
}
