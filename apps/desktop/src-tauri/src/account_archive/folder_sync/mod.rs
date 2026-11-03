mod crypto;
mod files;
mod key_update;
mod operations;

use serde::{Deserialize, Serialize};
use std::{
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
    time::Duration,
};
use tauri::{Emitter, Manager};
use zeroize::Zeroizing;

static OPERATION: Mutex<()> = Mutex::new(());
static ENABLED: AtomicBool = AtomicBool::new(false);
static LAST_ERROR: Mutex<Option<String>> = Mutex::new(None);

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", default)]
struct Config {
    folder: Option<PathBuf>,
    provider: String,
    enabled: bool,
    device: String,
    fingerprint: String,
    last_backup_at: Option<i64>,
}
impl Default for Config {
    fn default() -> Self {
        Self {
            folder: None,
            provider: "other".into(),
            enabled: false,
            device: uuid::Uuid::new_v4().to_string(),
            fingerprint: String::new(),
            last_backup_at: None,
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Status {
    folder: Option<String>,
    provider: String,
    enabled: bool,
    key_configured: bool,
    last_backup_at: Option<i64>,
    error: Option<String>,
    snapshots: Vec<files::Snapshot>,
    restored: Option<usize>,
}

#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub(crate) enum Action {
    Status,
    Configure {
        folder: String,
        provider: String,
        key: Option<String>,
        enabled: bool,
    },
    Disconnect,
    Backup,
    Restore {
        id: String,
    },
    ImportLegacy {
        path: String,
    },
    OpenFolder,
}

fn config_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|p| p.join("folder-sync.json"))
        .map_err(|_| "folderSyncIo".into())
}
fn read_config(app: &tauri::AppHandle) -> Result<Config, String> {
    match std::fs::read(config_path(app)?) {
        Ok(bytes) => serde_json::from_slice(&bytes).map_err(|_| "folderSyncIo".into()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Config::default()),
        Err(_) => Err("folderSyncIo".into()),
    }
}
fn save_config(app: &tauri::AppHandle, config: &Config) -> Result<(), String> {
    let value = serde_json::to_value(config).map_err(|_| "folderSyncIo")?;
    crate::storage::write_json_atomic(&config_path(app)?, &value).map_err(|_| "folderSyncIo")?;
    ENABLED.store(config.enabled, Ordering::Relaxed);
    Ok(())
}
fn key_entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new("dev.interlude.folder-sync", "recovery-key")
        .map_err(|_| "folderSyncKeyStore".into())
}
fn read_key() -> Result<Option<Zeroizing<Vec<u8>>>, String> {
    match key_entry()?.get_secret() {
        Ok(key) if key.len() == 32 => Ok(Some(Zeroizing::new(key))),
        Ok(_) => Err("folderSyncKey".into()),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(_) => Err("folderSyncKeyStore".into()),
    }
}
fn status(app: &tauri::AppHandle, restored: Option<usize>) -> Result<Status, String> {
    let config = read_config(app)?;
    let mut error = LAST_ERROR.lock().map_err(|_| "folderSyncBusy")?.clone();
    let mut snapshots = match &config.folder {
        Some(folder) => match files::list(folder, &config.device) {
            Ok(snapshots) => snapshots,
            Err(failure) => {
                error = Some(failure);
                vec![]
            }
        },
        None => vec![],
    };
    snapshots.truncate(100);
    Ok(Status {
        folder: config.folder.map(|p| p.display().to_string()),
        provider: config.provider,
        enabled: config.enabled,
        key_configured: read_key()?.is_some(),
        last_backup_at: config.last_backup_at,
        snapshots,
        error,
        restored,
    })
}

#[tauri::command]
pub(crate) async fn local_folder_sync(
    app: tauri::AppHandle,
    action: Action,
) -> Result<Status, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = OPERATION.try_lock().map_err(|_| "folderSyncBusy")?;
        let result = operations::perform(&app, action);
        if let Err(error) = &result {
            *LAST_ERROR.lock().map_err(|_| "folderSyncBusy")? = Some(error.clone());
        }
        result
    })
    .await
    .map_err(|_| "folderSyncIo".to_string())?
}

pub(crate) fn background_required() -> bool {
    ENABLED.load(Ordering::Relaxed)
}

pub(crate) fn setup(app: &tauri::AppHandle) -> Result<(), String> {
    match read_config(app) {
        Ok(config) => ENABLED.store(config.enabled, Ordering::Relaxed),
        Err(error) => *LAST_ERROR.lock().map_err(|_| "folderSyncBusy")? = Some(error),
    }
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(Duration::from_secs(120)).await;
            if !background_required() {
                continue;
            }
            let app = app.clone();
            let _ = local_folder_sync(app, Action::Backup).await;
        }
    });
    Ok(())
}

pub(crate) fn retire_server_settings(app: &tauri::AppHandle) -> Result<(), String> {
    let mut settings = crate::storage::read_app_settings(app)?;
    if settings.cloud_base_url.is_some()
        || settings.cloud_user_id.is_some()
        || settings.cloud_user_email.is_some()
        || settings.cloud_last_sync_at.is_some()
        || settings.cloud_session_expired
        || settings.show_custom_cloud_server
    {
        settings.cloud_base_url = None;
        settings.cloud_user_id = None;
        settings.cloud_user_email = None;
        settings.cloud_last_sync_at = None;
        settings.cloud_session_expired = false;
        settings.show_custom_cloud_server = false;
        crate::storage::write_app_settings(app, &settings)?;
    }
    let credentials = app
        .path()
        .app_data_dir()
        .map_err(|_| "folderSyncIo")?
        .join("cloud-auth.json");
    match std::fs::remove_file(credentials) {
        Ok(()) => (),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => (),
        Err(_) => return Err("folderSyncIo".into()),
    }
    Ok(())
}
