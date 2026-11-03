//! Reapply saved context preferences to external caches without delaying application startup.
use tauri::{AppHandle, Runtime};

use crate::storage::{read_app_settings, read_state, resolve_enabled_paths};

pub(super) fn restore<R: Runtime + 'static>(
    app: AppHandle<R>,
) -> tauri::async_runtime::JoinHandle<()> {
    tauri::async_runtime::spawn_blocking(move || {
        if let Err(error) = restore_blocking(&app) {
            eprintln!("Could not restore saved official model context settings: {error}");
        }
    })
}

fn restore_blocking<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let settings = read_app_settings(app)?;
    for paths in resolve_enabled_paths(app)? {
        let state = read_state(&paths);
        if !state.local_proxy_enabled
            || state.active_provider_id.is_some()
            || state.active_provider_group.is_some()
        {
            continue;
        }
        // Updating the cache reads existing preferences; it never resaves or migrates them.
        if let Err(error) =
            super::update_cached_model_context_windows(&paths, &settings, |catalog| {
                super::official_context_models::complete_cached(
                    app,
                    catalog,
                    &settings.official_model_context_windows,
                )
            })
        {
            eprintln!("Could not update an official model context cache at startup: {error}");
        }
    }
    Ok(())
}

#[cfg(test)]
#[path = "tests/official_context_startup.rs"]
mod tests;
