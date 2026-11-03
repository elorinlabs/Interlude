//! File-based local account selection. Never starts a process or writes Codex configuration.
use serde_json::Value;
use std::{
    fs, io,
    io::Write,
    path::{Path, PathBuf},
};
pub mod automation;
pub mod health;

#[derive(Debug, PartialEq)]
pub enum SwitchError {
    CredentialStore,
    Failed,
}

pub struct SwitchRequest<'a> {
    pub accounts: &'a Path,
    pub current_auth: &'a Path,
    pub state: &'a Path,
    pub id: &'a str,
}

fn valid_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 200
        && id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
}

fn oauth_account_id(auth: &Value) -> Option<&str> {
    auth.get("tokens")?.get("account_id")?.as_str()
}

fn read_json(path: &Path) -> Result<Value, SwitchError> {
    serde_json::from_slice(&fs::read(path).map_err(|_| SwitchError::Failed)?)
        .map_err(|_| SwitchError::Failed)
}

fn validate_oauth(auth: &Value) -> Result<(), SwitchError> {
    let tokens = auth.get("tokens").ok_or(SwitchError::Failed)?;
    for field in ["id_token", "access_token"] {
        if tokens
            .get(field)
            .and_then(Value::as_str)
            .is_none_or(str::is_empty)
        {
            return Err(SwitchError::Failed);
        }
    }
    if !matches!(
        auth.get("auth_mode").and_then(Value::as_str),
        None | Some("chatgpt")
    ) {
        return Err(SwitchError::Failed);
    }
    Ok(())
}

/// Retain only Codex OAuth fields; exclude passwords, 2FA, and arbitrary imported metadata.
pub fn sanitized_oauth(auth: &Value) -> Result<Value, SwitchError> {
    validate_oauth(auth)?;
    let tokens = auth.get("tokens").ok_or(SwitchError::Failed)?;
    let mut allowed = serde_json::Map::new();
    for name in ["id_token", "access_token", "refresh_token", "account_id"] {
        if let Some(value) = tokens.get(name).and_then(Value::as_str) {
            allowed.insert(name.to_owned(), Value::String(value.to_owned()));
        }
    }
    let mut clean = serde_json::json!({ "auth_mode": "chatgpt", "tokens": allowed });
    // Preserve the client's renewal metadata instead of resetting it on every import.
    if let Some(timestamp) = auth.get("last_refresh").and_then(Value::as_str) {
        clean["last_refresh"] = Value::String(timestamp.to_owned());
    }
    Ok(clean)
}

fn check_policy(auth_path: &Path, auth: &Value) -> Result<(), SwitchError> {
    let config_path = auth_path
        .parent()
        .ok_or(SwitchError::Failed)?
        .join("config.toml");
    let text = match fs::read_to_string(config_path) {
        Ok(text) => text,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => String::new(),
        Err(_) => return Err(SwitchError::Failed),
    };
    let config: toml_edit::DocumentMut = text.parse().map_err(|_| SwitchError::Failed)?;
    let setting = |name| config.get(name).and_then(toml_edit::Item::as_str);
    if !matches!(setting("cli_auth_credentials_store"), None | Some("file")) {
        return Err(SwitchError::CredentialStore);
    }
    if setting("forced_login_method").is_some_and(|method| method != "chatgpt") {
        return Err(SwitchError::CredentialStore);
    }
    if let Some(workspace) = setting("forced_chatgpt_workspace_id") {
        if oauth_account_id(auth) != Some(workspace) {
            return Err(SwitchError::CredentialStore);
        }
    }
    Ok(())
}

/// Resolve the existing parent while preserving the final filename and symlink semantics.
/// MSIX can redirect AppData onto another drive; both sides of an atomic rename must
/// address that same physical directory instead of mixing virtual and physical paths.
pub fn resolve_file_parent(path: &Path) -> io::Result<PathBuf> {
    let filename = path
        .file_name()
        .ok_or_else(|| io::Error::from(io::ErrorKind::InvalidInput))?;
    let parent = path
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new("."));
    Ok(fs::canonicalize(parent)?.join(filename))
}

fn write_atomic(path: &Path, bytes: &[u8]) -> Result<(), SwitchError> {
    let parent = path.parent().ok_or(SwitchError::Failed)?;
    fs::create_dir_all(parent).map_err(|_| SwitchError::Failed)?;
    let path = resolve_file_parent(path).map_err(|_| SwitchError::Failed)?;
    let parent = path.parent().ok_or(SwitchError::Failed)?;
    // NamedTempFile is private to the current user and persists with atomic replacement.
    let mut temporary = tempfile::NamedTempFile::new_in(parent).map_err(|_| SwitchError::Failed)?;
    temporary
        .write_all(bytes)
        .map_err(|_| SwitchError::Failed)?;
    temporary
        .as_file()
        .sync_all()
        .map_err(|_| SwitchError::Failed)?;
    temporary.persist(&path).map_err(|_| SwitchError::Failed)?;
    Ok(())
}

fn preserve_refreshed_auth(request: &SwitchRequest<'_>, state: &Value) -> Result<(), SwitchError> {
    let Some(previous) = state
        .get("active_account_id")
        .and_then(Value::as_str)
        .filter(|id| valid_id(id))
    else {
        return Ok(());
    };
    if !request.current_auth.is_file() {
        return Ok(());
    }
    let current = read_json(request.current_auth)?;
    let previous_path = request.accounts.join(previous).join("auth.json");
    if !previous_path.is_file() {
        return Ok(());
    }
    let saved = read_json(&previous_path)?;
    let refreshed_at = |value: &Value| {
        value
            .get("last_refresh")
            .and_then(Value::as_str)
            .and_then(|value| chrono::DateTime::parse_from_rfc3339(value).ok())
    };
    if matches!((refreshed_at(&current), refreshed_at(&saved)),
        (Some(live), Some(stored)) if live < stored)
    {
        return Ok(());
    }
    // Only preserve credentials from the exact same account, never a stale active marker.
    if oauth_account_id(&current).is_some()
        && oauth_account_id(&current) == oauth_account_id(&saved)
    {
        validate_oauth(&current)?;
        let bytes = serde_json::to_vec_pretty(&current).map_err(|_| SwitchError::Failed)?;
        write_atomic(&previous_path, &bytes)?;
    }
    Ok(())
}

/// Validate credentials, path containment and organization policy before closing a client.
pub fn validate_switch(request: &SwitchRequest<'_>) -> Result<(), SwitchError> {
    if !valid_id(request.id) {
        return Err(SwitchError::Failed);
    }
    let selected_path = request.accounts.join(request.id).join("auth.json");
    let root = request
        .accounts
        .canonicalize()
        .map_err(|_| SwitchError::Failed)?;
    let selected_path = selected_path
        .canonicalize()
        .map_err(|_| SwitchError::Failed)?;
    if !selected_path.starts_with(&root) {
        return Err(SwitchError::Failed);
    }
    let selected = read_json(&selected_path)?;
    validate_oauth(&selected)?;
    check_policy(request.current_auth, &selected)?;
    let state = if request.state.exists() {
        read_json(request.state)?
    } else {
        serde_json::json!({})
    };
    if !state.is_object() {
        return Err(SwitchError::Failed);
    }
    Ok(())
}

/// The caller must serialize account changes and ensure Codex is not running.
pub fn switch_account(request: SwitchRequest<'_>) -> Result<(), SwitchError> {
    validate_switch(&request)?;
    let selected_path = request
        .accounts
        .join(request.id)
        .join("auth.json")
        .canonicalize()
        .map_err(|_| SwitchError::Failed)?;
    let mut state = if request.state.exists() {
        read_json(request.state)?
    } else {
        serde_json::json!({})
    };
    preserve_refreshed_auth(&request, &state)?;
    // Re-read in case the selected account was the account with freshly rotated tokens.
    let selected = read_json(&selected_path)?;
    let previous_auth = match fs::read(request.current_auth) {
        Ok(bytes) => Some(bytes),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
        Err(_) => return Err(SwitchError::Failed),
    };
    state["active_account_id"] = Value::String(request.id.to_owned());
    let selected = serde_json::to_vec_pretty(&selected).map_err(|_| SwitchError::Failed)?;
    let state = serde_json::to_vec_pretty(&state).map_err(|_| SwitchError::Failed)?;
    write_atomic(request.current_auth, &selected)?;
    if write_atomic(request.state, &state).is_err() {
        match previous_auth {
            Some(bytes) => write_atomic(request.current_auth, &bytes)?,
            None => fs::remove_file(request.current_auth).map_err(|_| SwitchError::Failed)?,
        }
        return Err(SwitchError::Failed);
    }
    Ok(())
}

#[cfg(test)]
mod tests;

pub mod token_history;

pub mod import_merge;
