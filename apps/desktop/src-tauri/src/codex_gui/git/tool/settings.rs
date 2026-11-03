//! One host-owned preference shared by every local window and authenticated remote viewer.
use super::{GitError, Result};
use serde::{Deserialize, Serialize};
use std::{fs, path::Path};

const FILE_NAME: &str = "codex-gui-git-settings.json";

#[derive(Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Settings {
    auto_message: bool,
    revision: u64,
}

/// The caller holds GitState's guard on a blocking worker for the entire read/write transaction.
pub(super) fn access(directory: &Path, auto_message: Option<bool>) -> Result<Settings> {
    let path = directory.join(FILE_NAME);
    let mut settings: Settings = match fs::read(&path) {
        Ok(bytes) => serde_json::from_slice(&bytes).map_err(|_| GitError::Settings)?,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Settings::default(),
        Err(_) => return Err(GitError::Settings),
    };
    if let Some(auto_message) = auto_message {
        settings.auto_message = auto_message;
        settings.revision = settings.revision.checked_add(1).ok_or(GitError::Settings)?;
        let value = serde_json::to_value(&settings).map_err(|_| GitError::Settings)?;
        crate::storage::write_json_atomic(&path, &value).map_err(|_| GitError::Settings)?;
    }
    Ok(settings)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn preference_survives_reopening_and_newer_writes_have_increasing_revisions() {
        let directory = tempfile::tempdir().unwrap();
        assert!(!access(directory.path(), None).unwrap().auto_message);
        let saved = access(directory.path(), Some(true)).unwrap();
        let reopened = access(directory.path(), None).unwrap();
        assert!(reopened.auto_message);
        assert_eq!(saved.revision, reopened.revision);
        let disabled = access(directory.path(), Some(false)).unwrap();
        assert!(!disabled.auto_message);
        assert!(disabled.revision > reopened.revision);
    }

    #[test]
    fn malformed_settings_are_not_silently_reset_or_overwritten() {
        let directory = tempfile::tempdir().unwrap();
        fs::write(directory.path().join(FILE_NAME), "broken").unwrap();
        assert!(matches!(
            access(directory.path(), Some(false)),
            Err(GitError::Settings)
        ));
        assert_eq!(
            fs::read_to_string(directory.path().join(FILE_NAME)).unwrap(),
            "broken"
        );
    }
}
