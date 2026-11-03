use std::{
    fs,
    path::{Path, PathBuf},
};

use serde::Serialize;
use tauri::Runtime;

use crate::storage;

const PREFERENCE_FILENAME: &str = "chatgpt-launch-path.json";

#[derive(Debug, thiserror::Error)]
pub(crate) enum LaunchPathError {
    #[error("暂时无法读取 ChatGPT 启动路径，请重试。")]
    Load,
    #[error("暂时无法保存 ChatGPT 启动路径，请重试。")]
    Save,
    #[error("请选择有效的 ChatGPT 应用或可执行文件，并填写完整路径。")]
    Invalid,
}

impl LaunchPathError {
    fn code(&self) -> String {
        match self {
            Self::Load => "load",
            Self::Save => "save",
            Self::Invalid => "invalid",
        }
        .to_string()
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LaunchPathSettings {
    manual_path: Option<String>,
    detected_path: Option<String>,
}

// A dedicated file keeps unrelated settings snapshots from overwriting this preference.
fn read_preference(settings_path: &Path) -> Result<Option<String>, LaunchPathError> {
    match fs::read(settings_path.with_file_name(PREFERENCE_FILENAME)) {
        Ok(bytes) => serde_json::from_slice::<Option<String>>(&bytes)
            .map(|value| value.filter(|path| !path.trim().is_empty()))
            .map_err(|_| LaunchPathError::Load),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(_) => Err(LaunchPathError::Load),
    }
}

fn save_preference(settings_path: &Path, value: &str) -> Result<Option<String>, LaunchPathError> {
    let normalized = normalize_path(value)?;
    storage::write_json_atomic(
        &settings_path.with_file_name(PREFERENCE_FILENAME),
        &serde_json::json!(normalized),
    )
    .map_err(|_| LaunchPathError::Save)?;
    Ok(normalized)
}

fn normalize_path(value: &str) -> Result<Option<String>, LaunchPathError> {
    let value = value.trim();
    let value = value
        .strip_prefix('"')
        .and_then(|path| path.strip_suffix('"'))
        .unwrap_or(value);
    if value.is_empty() {
        return Ok(None);
    }
    let path = Path::new(value);
    if !path.is_absolute() || value.contains('\0') {
        return Err(LaunchPathError::Invalid);
    }
    validate_executable(path)?;
    Ok(Some(value.to_string()))
}

fn validate_executable(path: &Path) -> Result<PathBuf, LaunchPathError> {
    #[cfg(target_os = "macos")]
    if path.extension().is_some_and(|extension| extension == "app") {
        let name = path.file_stem().ok_or(LaunchPathError::Invalid)?;
        return validate_executable(&path.join("Contents/MacOS").join(name));
    }
    if !path.is_absolute() || !path.is_file() {
        return Err(LaunchPathError::Invalid);
    }
    #[cfg(target_os = "windows")]
    if !path
        .extension()
        .is_some_and(|extension| extension.eq_ignore_ascii_case("exe"))
    {
        return Err(LaunchPathError::Invalid);
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let permissions = path
            .metadata()
            .map_err(|_| LaunchPathError::Invalid)?
            .permissions();
        if permissions.mode() & 0o111 == 0 {
            return Err(LaunchPathError::Invalid);
        }
    }
    Ok(path.to_path_buf())
}

/// A configured path is authoritative: an invalid override must never fall back to discovery.
pub(crate) fn configured_executable<R: Runtime>(
    app: &tauri::AppHandle<R>,
) -> Result<Option<PathBuf>, LaunchPathError> {
    let settings_path = storage::app_settings_path(app).map_err(|_| LaunchPathError::Load)?;
    configured_executable_from(&settings_path)
}

fn configured_executable_from(settings_path: &Path) -> Result<Option<PathBuf>, LaunchPathError> {
    read_preference(settings_path)?
        .map(|path| validate_executable(Path::new(&path)))
        .transpose()
}

#[tauri::command]
pub(crate) async fn get_chatgpt_launch_path<R: Runtime + 'static>(
    app: tauri::AppHandle<R>,
) -> Result<LaunchPathSettings, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let settings_path =
            storage::app_settings_path(&app).map_err(|_| LaunchPathError::Load.code())?;
        let manual_path = read_preference(&settings_path).map_err(|error| error.code())?;
        let detected_path = crate::commands::detect_chatgpt_launch_path(&app);
        Ok(LaunchPathSettings {
            manual_path,
            detected_path,
        })
    })
    .await
    .map_err(|_| LaunchPathError::Load.code())?
}

#[tauri::command]
pub(crate) async fn set_chatgpt_launch_path<R: Runtime + 'static>(
    app: tauri::AppHandle<R>,
    path: String,
) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _switch = crate::commands::account_switch_lock()
            .lock()
            .map_err(|_| LaunchPathError::Save.code())?;
        let settings_path =
            storage::app_settings_path(&app).map_err(|_| LaunchPathError::Save.code())?;
        save_preference(&settings_path, &path).map_err(|error| error.code())
    })
    .await
    .map_err(|_| LaunchPathError::Save.code())?
}

#[cfg(test)]
mod tests;
