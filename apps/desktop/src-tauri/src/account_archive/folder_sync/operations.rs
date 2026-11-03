use super::*;
use sha2::{Digest, Sha256};
use tauri_plugin_opener::OpenerExt;

fn configure(
    app: &tauri::AppHandle,
    folder: String,
    provider: String,
    key: Option<String>,
    enabled: bool,
) -> Result<(), String> {
    if !matches!(
        provider.as_str(),
        "nutstore" | "baidu" | "aliyun" | "quark" | "weiyun" | "123pan" | "onedrive" | "other"
    ) {
        return Err("folderSyncFormat".into());
    }
    let folder = files::folder(&folder)?;
    let previous_key = read_key()?;
    let supplied = key.map(Zeroizing::new);
    let key = match supplied
        .as_deref()
        .map(|v| v.trim())
        .filter(|v| !v.is_empty())
    {
        Some(value) => crypto::parse_key(value)?,
        None => previous_key.clone().ok_or("folderSyncKey")?,
    };
    let mut config = read_config(app)?;
    if let Some(snapshot) = files::list(&folder, &config.device)?.first() {
        crypto::open(&files::read(&folder, &snapshot.id)?, &key)?;
    }
    let changed = config.folder.as_ref() != Some(&folder) || previous_key.as_deref() != Some(&*key);
    if changed {
        config.fingerprint.clear();
        config.last_backup_at = None;
    }
    config.folder = Some(folder);
    config.provider = provider;
    config.enabled = enabled;
    let entry = key_entry()?;
    key_update::save(
        &key,
        previous_key.as_deref().map(|k| k.as_slice()),
        |value| {
            match value {
                Some(key) => entry.set_secret(key),
                None => entry.delete_credential(),
            }
            .map_err(|_| "folderSyncKeyStore".to_string())
        },
        || save_config(app, &config),
    )
}

fn collect(app: &tauri::AppHandle) -> Result<super::super::AccountArchivePayload, String> {
    super::super::collect_full_snapshot(app)
}

fn backup(app: &tauri::AppHandle, force: bool) -> Result<(), String> {
    let mut config = read_config(app)?;
    let Some(folder) = config.folder.as_ref() else {
        return Ok(());
    };
    let _guard = crate::client_lifecycle::try_lock(crate::commands::account_switch_lock())
        .map_err(|_| "folderSyncBusy")?;
    let key = read_key()?.ok_or("folderSyncKey")?;
    let mut payload = collect(app)?;
    // A fresh installation must not replace a populated backup with an empty account store.
    if payload.accounts.is_empty() {
        return Ok(());
    }
    let canonical = Zeroizing::new(serde_json::to_vec(&payload).map_err(|_| "folderSyncFormat")?);
    let fingerprint = format!("{:x}", Sha256::digest(&canonical));
    if !force
        && fingerprint == config.fingerprint
        && files::list(folder, &config.device)?
            .iter()
            .any(|snapshot| snapshot.local)
    {
        return Ok(());
    }
    payload.exported_at = chrono::Utc::now().to_rfc3339();
    let bytes = Zeroizing::new(serde_json::to_vec(&payload).map_err(|_| "folderSyncFormat")?);
    files::write(folder, &config.device, &crypto::seal(&bytes, &key)?)?;
    config.fingerprint = fingerprint;
    config.last_backup_at = Some(chrono::Utc::now().timestamp_millis());
    save_config(app, &config)
}

fn restore(app: &tauri::AppHandle, id: &str) -> Result<usize, String> {
    let config = read_config(app)?;
    let folder = config.folder.as_ref().ok_or("folderSyncFolder")?;
    let key = read_key()?.ok_or("folderSyncKey")?;
    let decrypted = crypto::open(&files::read(folder, id)?, &key)?;
    let payload: super::super::AccountArchivePayload =
        serde_json::from_slice(&decrypted).map_err(|_| "folderSyncFormat")?;
    restore_payload(app, payload)
}

fn restore_payload(
    app: &tauri::AppHandle,
    payload: super::super::AccountArchivePayload,
) -> Result<usize, String> {
    if payload.accounts.len() > 2000 {
        return Err("folderSyncFormat".into());
    }
    if read_config(app)?.folder.is_none() || read_key()?.is_none() {
        return Err("folderSyncFolder".into());
    }
    backup(app, true)?;
    let _guard = crate::client_lifecycle::try_lock(crate::commands::account_switch_lock())
        .map_err(|_| "folderSyncBusy")?;
    super::super::restore_full_snapshot(app, payload)
}

pub(super) fn perform(app: &tauri::AppHandle, action: Action) -> Result<Status, String> {
    if matches!(action, Action::Status) {
        return status(app, None);
    }
    let mut restored = None;
    match action {
        Action::Status => (),
        Action::Configure {
            folder,
            provider,
            key,
            enabled,
        } => {
            configure(app, folder, provider, key, enabled)?;
            if enabled {
                backup(app, false)?;
            }
        }
        Action::Disconnect => {
            let mut config = read_config(app)?;
            config.folder = None;
            config.enabled = false;
            config.fingerprint.clear();
            config.last_backup_at = None;
            save_config(app, &config)?;
        }
        Action::Backup => backup(app, false)?,
        Action::Restore { id } => restored = Some(restore(app, &id)?),
        Action::ImportLegacy { path } => {
            let path = std::path::Path::new(&path);
            if !path.is_absolute()
                || path.extension().is_none_or(|v| v != "cs")
                || std::fs::metadata(path)
                    .map_err(|_| "folderSyncMissing")?
                    .len()
                    > crypto::MAX_BYTES as u64
            {
                return Err("folderSyncFormat".into());
            }
            let payload = super::super::decode_archive(path).map_err(|_| "folderSyncFormat")?;
            restored = Some(restore_payload(app, payload)?);
        }
        Action::OpenFolder => {
            let folder = read_config(app)?.folder.ok_or("folderSyncFolder")?;
            if !folder.is_dir() {
                return Err("folderSyncFolder".into());
            }
            app.opener()
                .open_path(folder.to_string_lossy(), None::<&str>)
                .map_err(|_| "folderSyncIo")?;
        }
    }
    *LAST_ERROR.lock().map_err(|_| "folderSyncBusy")? = None;
    app.emit("interlude-folder-sync-updated", ())
        .map_err(|_| "folderSyncIo")?;
    status(app, restored)
}
