use tauri::Runtime;

use crate::{
    codex_gui::account_selection,
    providers,
    storage::{read_state, Paths},
};

/// Reconcile shared and GUI selections after synced updates or archive restoration.
pub(crate) fn refresh_targets<R: Runtime>(
    app: &tauri::AppHandle<R>,
    paths: &Paths,
) -> Result<(), String> {
    let state = read_state(paths);
    if let Some(id) = state
        .active_provider_id
        .as_deref()
        .filter(|id| super::is_active_id(id))
    {
        let available = super::read_active_config(paths, id)
            .ok()
            .filter(|config| config.enabled)
            .filter(|config| super::member_profiles(paths, config).is_ok());
        if available.is_some() {
            providers::apply_local_proxy_config_for_state(app)?;
        } else {
            providers::disable_provider_blocking(app.clone())?;
        }
    }
    account_selection::refresh_aggregate_selection(app).map_err(|error| error.to_string())
}
