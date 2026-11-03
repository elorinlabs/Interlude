//! Model choices belong to a conversation; the draft has its own defaults.
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
};
use tauri::{AppHandle, Manager};

const DIRECTORY: &str = "codex-gui-model-settings";
const CHANGED_EVENT: &str = "codex-gui-model-settings-changed";
const MAX_NAME_BYTES: usize = 200;

#[derive(Debug, thiserror::Error)]
pub(crate) enum ModelSettingsError {
    #[error("暂时无法保存或读取对话的模型设置，请稍后重试。")]
    Storage,
    #[error("模型设置无效，请重新选择。")]
    Invalid,
}
type Result<T> = std::result::Result<T, ModelSettingsError>;

#[derive(Clone, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum Effort {
    None,
    Minimal,
    Low,
    Medium,
    High,
    Xhigh,
    Max,
    Ultra,
}

/// Only model and reasoning are shared; access permissions are not changed by synchronization.
#[derive(Clone, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct ModelSelection {
    pub(super) model: String,
    pub(super) effort: Effort,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ModelSettingsSnapshot {
    thread_id: Option<String>,
    selection: Option<ModelSelection>,
    revision: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    live_update: Option<LiveModelUpdate>,
}

/// Serializes complete file operations and their event publication on background workers.
#[derive(Default)]
pub(crate) struct ModelSettingsState {
    storage: Mutex<()>,
    // Serialize saves and live publication across desktop and browser clients without blocking the UI.
    writes: tokio::sync::Mutex<()>,
}

/// Publication result for the current task; saved choices still apply to future turns.
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum LiveModelUpdate {
    Applied,
    NextTurn,
    Failed,
}

fn settings_path(root: &Path, thread_id: Option<&str>) -> Result<PathBuf> {
    let name = match thread_id {
        None => "draft.json".to_owned(),
        Some(id)
            if !id.is_empty()
                && id.len() <= MAX_NAME_BYTES
                && id
                    .bytes()
                    .all(|c| c.is_ascii_alphanumeric() || c == b'-' || c == b'_') =>
        {
            format!("thread-{id}.json")
        }
        Some(_) => return Err(ModelSettingsError::Invalid),
    };
    Ok(root.join(DIRECTORY).join(name))
}

fn read(root: &Path, thread_id: Option<String>) -> Result<ModelSettingsSnapshot> {
    let path = settings_path(root, thread_id.as_deref())?;
    match fs::read(path) {
        Ok(bytes) => {
            let snapshot: ModelSettingsSnapshot =
                serde_json::from_slice(&bytes).map_err(|_| ModelSettingsError::Storage)?;
            if snapshot.thread_id != thread_id {
                return Err(ModelSettingsError::Storage);
            }
            Ok(snapshot)
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(ModelSettingsSnapshot {
            thread_id,
            selection: None,
            revision: 0,
            live_update: None,
        }),
        Err(_) => Err(ModelSettingsError::Storage),
    }
}

fn save(
    root: &Path,
    thread_id: Option<String>,
    selection: ModelSelection,
) -> Result<ModelSettingsSnapshot> {
    validate_model(&selection.model)?;
    let previous = read(root, thread_id.clone())?;
    if previous.selection.as_ref() == Some(&selection) {
        return Ok(previous);
    }
    let path = settings_path(root, thread_id.as_deref())?;
    let snapshot = ModelSettingsSnapshot {
        thread_id,
        selection: Some(selection),
        revision: previous
            .revision
            .checked_add(1)
            .ok_or(ModelSettingsError::Storage)?,
        live_update: None,
    };
    fs::create_dir_all(root.join(DIRECTORY)).map_err(|_| ModelSettingsError::Storage)?;
    let value = serde_json::to_value(&snapshot).map_err(|_| ModelSettingsError::Storage)?;
    crate::storage::write_json_atomic(&path, &value).map_err(|_| ModelSettingsError::Storage)?;
    Ok(snapshot)
}

pub(super) fn validate_model(model: &str) -> Result<()> {
    if model.trim() != model
        || model.is_empty()
        || model.len() > MAX_NAME_BYTES
        || model.chars().any(char::is_control)
    {
        return Err(ModelSettingsError::Invalid);
    }
    Ok(())
}

async fn access(
    app: AppHandle,
    thread_id: Option<String>,
    selection: Option<ModelSelection>,
) -> Result<ModelSettingsSnapshot> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<ModelSettingsState>();
        let _guard = state
            .storage
            .lock()
            .map_err(|_| ModelSettingsError::Storage)?;
        let root = app
            .path()
            .app_data_dir()
            .map_err(|_| ModelSettingsError::Storage)?;
        let Some(selection) = selection else {
            return read(&root, thread_id);
        };
        save(&root, thread_id, selection)
    })
    .await
    .map_err(|_| ModelSettingsError::Storage)?
}

#[tauri::command]
pub(crate) async fn codex_gui_model_settings(
    app: AppHandle,
    thread_id: Option<String>,
) -> std::result::Result<ModelSettingsSnapshot, String> {
    access(app, thread_id, None)
        .await
        .map_err(|error| error.to_string())
}

/// Persist a host-created conversation's choice before its first turn, leaving the draft unchanged.
pub(super) async fn persist_created(
    app: AppHandle,
    thread_id: String,
    selection: ModelSelection,
) -> super::Result<()> {
    let state = app.state::<ModelSettingsState>();
    let _write = state.writes.lock().await;
    let snapshot = access(app.clone(), Some(thread_id), Some(selection))
        .await
        .map_err(|_| super::GuiError::Rpc)?;
    super::web::publish(&app, CHANGED_EVENT, &snapshot);
    Ok(())
}

#[tauri::command]
pub(crate) async fn codex_gui_set_model_settings(
    app: AppHandle,
    thread_id: Option<String>,
    selection: ModelSelection,
) -> std::result::Result<ModelSettingsSnapshot, String> {
    let state = app.state::<ModelSettingsState>();
    let _write = state.writes.lock().await;
    let mut snapshot = access(app.clone(), thread_id.clone(), Some(selection.clone()))
        .await
        .map_err(|error| error.to_string())?;
    if let Some(thread_id) = thread_id {
        if let Ok(client) = super::connected(&app.state::<super::GuiState>()).await {
            snapshot.live_update = Some(client.update_live_model(&thread_id, &selection).await);
        }
    }
    super::web::publish(&app, CHANGED_EVENT, &snapshot);
    Ok(snapshot)
}

#[cfg(test)]
#[path = "model_settings_tests.rs"]
mod tests;
