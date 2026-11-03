//! Host preferences persist; temporary audio and lock ownership follow the last retained display.
use super::{DesktopError, Result};
use serde::{Deserialize, Serialize};

#[cfg(windows)]
mod guard;
#[cfg(windows)]
#[path = "security/windows.rs"]
mod platform;
#[cfg(any(windows, test))]
mod preferences;
#[cfg(windows)]
pub(super) use guard::Guard;

#[cfg(windows)]
pub(crate) fn reset_preferences(root: &std::path::Path) -> Result<()> {
    preferences::Store::new(root).save(&Default::default())
}

#[derive(Clone, Debug, Default, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Snapshot {
    pub lock_on_disconnect: bool,
    pub mute_host: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub clipboard_sync: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub privacy_screen: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub auto_unlock: Option<super::auto_unlock::Snapshot>,
}

#[derive(Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct Change {
    lock_on_disconnect: Option<bool>,
    mute_host: Option<bool>,
    clipboard_sync: Option<bool>,
    auto_unlock: Option<super::auto_unlock::Change>,
}

fn apply(id: &str, change: Change) -> Result<Snapshot> {
    super::with_lease(id, |session| {
        if !session.permissions.control
            || (change.mute_host == Some(true) && !session.permissions.audio)
        {
            return Err(DesktopError::Denied);
        }
        #[cfg(windows)]
        return session.security.apply(change);
        #[cfg(not(windows))]
        Err(DesktopError::Platform)
    })
}

#[tauri::command]
pub(crate) async fn remote_desktop_security(
    id: String,
    change: Change,
) -> std::result::Result<Snapshot, String> {
    #[cfg(windows)]
    if crate::desktop_service::delegation::delegated(&id) {
        return crate::desktop_service::delegation::call(
            "remote_desktop_security",
            &id,
            serde_json::json!({ "change": change }),
        )
        .await;
    }
    tauri::async_runtime::spawn_blocking(move || apply(&id, change))
        .await
        .map_err(|_| "安全选项未能保存，请重试。".to_owned())?
        .map_err(super::safe_error)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn security_changes_reject_unknown_or_non_boolean_values() {
        for value in [
            serde_json::json!({"muteHost": "true"}),
            serde_json::json!({"unlock": true}),
        ] {
            assert!(serde_json::from_value::<Change>(value).is_err());
        }
        assert!(
            serde_json::from_value::<Change>(serde_json::json!({"lockOnDisconnect": true})).is_ok()
        );
    }

    #[cfg(windows)]
    #[test]
    fn retained_displays_share_security_without_resetting_it() {
        let root = tempfile::tempdir().unwrap();
        let first = Guard::load(root.path()).unwrap();
        let second = first.clone();
        let enabled = Change {
            lock_on_disconnect: Some(true),
            mute_host: None,
            auto_unlock: None,
            clipboard_sync: None,
        };
        assert!(first.apply(enabled).unwrap().lock_on_disconnect);
        drop(first);
        assert!(second.snapshot().unwrap().lock_on_disconnect);
        // Disable before dropping the final owner: tests must never lock the developer's PC.
        second
            .apply(Change {
                lock_on_disconnect: Some(false),
                mute_host: None,
                auto_unlock: None,
                clipboard_sync: None,
            })
            .unwrap();
    }

    #[cfg(windows)]
    #[test]
    fn a_new_capture_loads_host_preferences_without_a_viewer_cache() {
        let root = tempfile::tempdir().unwrap();
        let first = Guard::load(root.path()).unwrap();
        first
            .apply(Change {
                lock_on_disconnect: Some(true),
                clipboard_sync: Some(false),
                ..Default::default()
            })
            .unwrap();
        first.remember_privacy(true).unwrap();
        // No live connection was started, so dropping this test guard cannot lock the workstation.
        drop(first);
        let next = Guard::load(root.path()).unwrap();
        let snapshot = next.snapshot().unwrap();
        assert!(snapshot.lock_on_disconnect);
        assert_eq!(snapshot.clipboard_sync, Some(false));
        assert_eq!(snapshot.privacy_screen, Some(true));
        next.apply(Change {
            lock_on_disconnect: Some(false),
            ..Default::default()
        })
        .unwrap();
        drop(next);
        assert!(
            !Guard::load(root.path())
                .unwrap()
                .snapshot()
                .unwrap()
                .lock_on_disconnect
        );
    }

    #[cfg(windows)]
    #[test]
    fn rejected_writes_do_not_report_new_settings_as_saved() {
        let root = tempfile::tempdir().unwrap();
        let guard = Guard::load(root.path()).unwrap();
        std::fs::create_dir(root.path().join("remote-desktop-security.json")).unwrap();
        assert!(guard
            .apply(Change {
                lock_on_disconnect: Some(true),
                ..Default::default()
            })
            .is_err());
        assert!(!guard.snapshot().unwrap().lock_on_disconnect);
    }
}
