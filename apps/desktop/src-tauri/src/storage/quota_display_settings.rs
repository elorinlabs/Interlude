/// Read and change this preference under the existing settings serialization guard.
pub(crate) fn update_quota_display<R: Runtime>(
    app: &tauri::AppHandle<R>,
    enabled: bool,
) -> Result<AppSettings, String> {
    let _guard = APP_SETTINGS_WRITE_LOCK.lock()
        .map_err(|_| "Application settings are unavailable".to_string())?;
    let mut settings = read_app_settings(app)?;
    settings.quota_display_all_accounts = enabled;
    let value = serde_json::to_value(&settings).map_err(|error| error.to_string())?;
    write_json_atomic(&app_settings_path(app)?, &value)?;
    Ok(settings)
}
