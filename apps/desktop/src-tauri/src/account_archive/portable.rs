use super::*;
use zeroize::Zeroizing;

#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub(crate) enum Action {
    Export { path: String, password: String },
    Import { path: String, password: String },
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Report {
    path: String,
    accounts: usize,
    saved_logins: usize,
    safety_backup: Option<String>,
}

fn export(app: &tauri::AppHandle, path: &str, password: &str) -> Result<Report, String> {
    let mut payload = collect_full_snapshot(app)?;
    if payload.accounts.is_empty() {
        return Err("backupEmpty".into());
    }
    payload.exported_at = Utc::now().to_rfc3339();
    let bytes = Zeroizing::new(serde_json::to_vec(&payload).map_err(|_| "backupFormat")?);
    let encrypted = super::password_crypto::seal(&bytes, password)?;
    let path = super::portable_file::write(Path::new(path), &encrypted)?;
    Ok(Report {
        path: path.display().to_string(),
        accounts: payload.accounts.len(),
        saved_logins: payload.saved_logins.len(),
        safety_backup: None,
    })
}

fn import(app: &tauri::AppHandle, path: &str, password: &str) -> Result<Report, String> {
    let encrypted = super::portable_file::read(Path::new(path))?;
    let bytes = super::password_crypto::open(&encrypted, password)?;
    let payload: AccountArchivePayload =
        serde_json::from_slice(&bytes).map_err(|_| "backupFormat")?;
    let saved_logins = payload.saved_logins.len();
    let safety = if !collect_full_snapshot(app)?.accounts.is_empty() {
        let directory = app
            .path()
            .app_data_dir()
            .map_err(|_| "backupFile")?
            .join("backup-before-restore");
        fs::create_dir_all(&directory).map_err(|_| "backupFile")?;
        let backup = directory.join(format!("{}.interlude-backup", uuid::Uuid::new_v4()));
        Some(export(app, backup.to_string_lossy().as_ref(), password)?.path)
    } else {
        None
    };
    let accounts = restore_full_snapshot(app, payload)?;
    Ok(Report {
        path: path.to_string(),
        accounts,
        saved_logins,
        safety_backup: safety,
    })
}

#[tauri::command]
pub(crate) async fn portable_account_backup(
    app: tauri::AppHandle,
    action: Action,
) -> Result<Report, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = crate::client_lifecycle::try_lock(crate::commands::account_switch_lock())
            .map_err(|_| "folderSyncBusy")?;
        match action {
            Action::Export { path, password } => export(&app, &path, &Zeroizing::new(password)),
            Action::Import { path, password } => import(&app, &path, &Zeroizing::new(password)),
        }
    })
    .await
    .map_err(|_| "backupFile".to_string())?
}
