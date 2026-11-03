//! Non-secret security preferences live on the host, independently of capture leases.
use super::super::{DesktopError, Result};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", default)]
pub(super) struct Preferences {
    pub lock_on_disconnect: bool,
    pub mute_host: bool,
    pub clipboard_sync: bool,
    pub privacy_screen: bool,
}

impl Default for Preferences {
    fn default() -> Self {
        Self {
            lock_on_disconnect: false,
            mute_host: false,
            clipboard_sync: true,
            privacy_screen: false,
        }
    }
}

pub(super) struct Store(PathBuf);
impl Store {
    pub(super) fn new(root: &Path) -> Self {
        Self(root.join("remote-desktop-security.json"))
    }

    pub(super) fn load(&self) -> Result<Preferences> {
        match std::fs::read(&self.0) {
            Ok(bytes) => serde_json::from_slice(&bytes).map_err(|_| DesktopError::Settings),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                Ok(Preferences::default())
            }
            Err(_) => Err(DesktopError::Settings),
        }
    }

    pub(super) fn save(&self, value: &Preferences) -> Result<()> {
        let json = serde_json::to_value(value).map_err(|_| DesktopError::Settings)?;
        crate::storage::write_json_atomic(&self.0, &json).map_err(|_| DesktopError::Settings)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn host_preferences_survive_reopening_and_do_not_contain_credentials() {
        let root = tempfile::tempdir().unwrap();
        let store = Store::new(root.path());
        assert_eq!(store.load().unwrap(), Preferences::default());
        let saved = Preferences {
            lock_on_disconnect: true,
            mute_host: true,
            clipboard_sync: false,
            privacy_screen: true,
        };
        store.save(&saved).unwrap();
        drop(store);
        let reopened = Store::new(root.path());
        assert_eq!(reopened.load().unwrap(), saved);
        let json: serde_json::Value =
            serde_json::from_slice(&std::fs::read(&reopened.0).unwrap()).unwrap();
        assert_eq!(json.as_object().unwrap().len(), 4);
        reopened.save(&Preferences::default()).unwrap();
        assert_eq!(
            Store::new(root.path()).load().unwrap(),
            Preferences::default()
        );
    }

    #[test]
    fn corrupt_or_unwritable_preferences_never_silently_become_defaults() {
        let root = tempfile::tempdir().unwrap();
        let store = Store::new(root.path());
        std::fs::write(&store.0, b"{broken").unwrap();
        assert!(store.load().is_err());
        std::fs::remove_file(&store.0).unwrap();
        std::fs::create_dir(&store.0).unwrap();
        assert!(store.save(&Preferences::default()).is_err());
    }
}
