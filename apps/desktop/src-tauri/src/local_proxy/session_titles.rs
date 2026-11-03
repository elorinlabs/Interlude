use std::{
    collections::{HashMap, HashSet},
    path::PathBuf,
};
use tauri::{AppHandle, Runtime};

const TITLE_GENERATION_SESSION_TITLE: &str = "内部对话标题生成";

/// Ephemeral naming threads have no saved metadata; label their requests before history is saved.
pub(super) fn from_request(headers: &[(String, String)]) -> Option<&'static str> {
    use crate::codex_config::{
        HELP_REQUEST_PURPOSE, LOCAL_PROXY_REQUEST_PURPOSE_HEADER, PREDICTION_REQUEST_PURPOSE,
        TITLE_GENERATION_REQUEST_PURPOSE,
    };
    match super::header_value(headers, LOCAL_PROXY_REQUEST_PURPOSE_HEADER) {
        Some(TITLE_GENERATION_REQUEST_PURPOSE) => Some(TITLE_GENERATION_SESSION_TITLE),
        Some(PREDICTION_REQUEST_PURPOSE) => Some("下一句话建议"),
        Some(HELP_REQUEST_PURPOSE) => Some("Interlude 问题解答"),
        Some(crate::codex_config::GIT_MESSAGE_REQUEST_PURPOSE) => Some("Git 提交说明"),
        _ => None,
    }
}

/// Called from the session list's blocking worker; metadata I/O must stay off the UI thread.
pub(super) fn resolve<R: Runtime>(
    app: &AppHandle<R>,
    session_ids: &HashSet<String>,
) -> HashMap<String, String> {
    if session_ids.is_empty() {
        return HashMap::new();
    }
    let configured = crate::codex_home::resolve_all()
        .unwrap_or_default()
        .into_iter()
        .map(|home| home.path);
    let homes = title_homes(configured, crate::codex_home::gui_home(app).ok());
    resolve_from_homes(&homes, session_ids)
}

fn title_homes(
    configured: impl IntoIterator<Item = PathBuf>,
    gui_home: Option<PathBuf>,
) -> Vec<PathBuf> {
    let mut seen = HashSet::new();
    // The GUI uses its private home even when account/Provider synchronization is disabled.
    configured
        .into_iter()
        .chain(gui_home)
        .filter(|home| seen.insert(home.clone()))
        .collect()
}

fn resolve_from_homes(homes: &[PathBuf], session_ids: &HashSet<String>) -> HashMap<String, String> {
    let mut remaining = session_ids.clone();
    let mut titles = HashMap::new();
    for home in homes {
        if remaining.is_empty() {
            break;
        }
        match crate::commands::conversation_titles_by_id(home, &remaining) {
            Ok(found) => {
                remaining.retain(|id| !found.contains_key(id));
                titles.extend(found);
            }
            Err(error) => {
                // One unavailable home must not hide titles from other clients.
                log_proxy_error!("failed to read proxy session titles: {error}");
            }
        }
    }
    titles
}

#[cfg(test)]
#[path = "tests/session_titles.rs"]
mod tests;
