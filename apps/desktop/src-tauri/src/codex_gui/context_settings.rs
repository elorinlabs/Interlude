//! Per-conversation capacity overrides, applied when Codex loads a conversation.
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
};
use tauri::{AppHandle, Manager};

const DIRECTORY: &str = "codex-gui-context-settings";
const MIN_CAPACITY: u64 = 1_000;
const MAX_CAPACITY: u64 = 100_000_000;
const MAX_ID_BYTES: usize = 200;
const AUTO_COMPACT_PERCENT: u64 = 90;
const FULL_PERCENT: u64 = 100;

#[derive(Debug, thiserror::Error)]
pub(crate) enum ContextSettingsError {
    #[error("暂时无法读取或保存上下文设置，请重试。")]
    Storage,
    #[error("请输入 1 至 100000 K 之间的上下文容量。")]
    InvalidCapacity,
    #[error("请先选择一个对话。")]
    InvalidThread,
}
type Result<T> = std::result::Result<T, ContextSettingsError>;

#[derive(Clone, Debug, Default, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct ContextSettings {
    pub(super) capacity: Option<u64>,
}

/// Reports whether a running conversation continued after applying its capacity.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum ContextUpdate {
    Applied,
    Continued,
    Paused,
    ResumeFailed,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ContextUpdateResult {
    #[serde(flatten)]
    pub(super) settings: ContextSettings,
    pub(super) update: ContextUpdate,
}

/// The guard covers each complete read or atomic write on a blocking worker.
#[derive(Default)]
pub(crate) struct ContextSettingsState(Mutex<()>);

fn settings_path(root: &Path, thread_id: &str) -> Result<PathBuf> {
    if thread_id.is_empty()
        || thread_id.len() > MAX_ID_BYTES
        || !thread_id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
    {
        return Err(ContextSettingsError::InvalidThread);
    }
    Ok(root.join(DIRECTORY).join(format!("{thread_id}.json")))
}

fn validate(settings: &ContextSettings) -> Result<()> {
    if settings
        .capacity
        .is_some_and(|value| !(MIN_CAPACITY..=MAX_CAPACITY).contains(&value))
    {
        return Err(ContextSettingsError::InvalidCapacity);
    }
    Ok(())
}

fn read(root: &Path, thread_id: &str) -> Result<ContextSettings> {
    match fs::read(settings_path(root, thread_id)?) {
        Ok(bytes) => {
            let settings =
                serde_json::from_slice(&bytes).map_err(|_| ContextSettingsError::Storage)?;
            validate(&settings)?;
            Ok(settings)
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            Ok(ContextSettings::default())
        }
        Err(_) => Err(ContextSettingsError::Storage),
    }
}

fn save(root: &Path, thread_id: &str, settings: ContextSettings) -> Result<ContextSettings> {
    validate(&settings)?;
    let path = settings_path(root, thread_id)?;
    fs::create_dir_all(root.join(DIRECTORY)).map_err(|_| ContextSettingsError::Storage)?;
    let value = serde_json::to_value(&settings).map_err(|_| ContextSettingsError::Storage)?;
    crate::storage::write_json_atomic(&path, &value).map_err(|_| ContextSettingsError::Storage)?;
    Ok(settings)
}

async fn access(
    app: AppHandle,
    thread_id: String,
    settings: Option<ContextSettings>,
) -> Result<ContextSettings> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<ContextSettingsState>();
        let _guard = state.0.lock().map_err(|_| ContextSettingsError::Storage)?;
        let root = app
            .path()
            .app_data_dir()
            .map_err(|_| ContextSettingsError::Storage)?;
        match settings {
            Some(settings) => save(&root, &thread_id, settings),
            None => read(&root, &thread_id),
        }
    })
    .await
    .map_err(|_| ContextSettingsError::Storage)?
}

#[tauri::command]
pub(crate) async fn codex_gui_context_settings(
    app: AppHandle,
    thread_id: String,
) -> std::result::Result<ContextSettings, String> {
    access(app, thread_id, None)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub(crate) async fn codex_gui_set_context_settings(
    app: AppHandle,
    thread_id: String,
    settings: ContextSettings,
) -> std::result::Result<ContextUpdateResult, String> {
    validate(&settings).map_err(|error| error.to_string())?;
    settings_path(Path::new(""), &thread_id).map_err(|error| error.to_string())?;
    let update = match super::connected(&app.state::<super::GuiState>()).await {
        Ok(client) => client
            .change_context(&thread_id, &settings)
            .await
            .map_err(|_| "未能应用上下文设置，请重试；若对话已暂停，可点击继续。".to_owned())?,
        Err(_) => {
            persist(app, thread_id, settings.clone())
                .await
                .map_err(|error| error.to_string())?;
            ContextUpdate::Applied
        }
    };
    Ok(ContextUpdateResult { settings, update })
}

pub(super) async fn persist(
    app: AppHandle,
    thread_id: String,
    settings: ContextSettings,
) -> Result<ContextSettings> {
    access(app, thread_id, Some(settings)).await
}

pub(super) async fn for_thread(app: AppHandle, thread_id: String) -> Result<ContextSettings> {
    access(app, thread_id, None).await
}

pub(super) fn apply_capacity(params: &mut Value, settings: &ContextSettings) {
    // An explicit empty config resets a previous override when rejoining an unsubscribed thread.
    if !params["config"].is_object() {
        params["config"] = serde_json::json!({});
    }
    if let Some(capacity) = settings.capacity {
        params["config"]["model_context_window"] = capacity.into();
        // Match Codex's default headroom, replacing stale config or catalog thresholds.
        // Codex still clamps this against the model's resolved context window.
        params["config"]["model_auto_compact_token_limit"] =
            (capacity * AUTO_COMPACT_PERCENT / FULL_PERCENT).into();
    }
}

#[cfg(test)]
#[path = "context_settings_tests.rs"]
mod tests;
