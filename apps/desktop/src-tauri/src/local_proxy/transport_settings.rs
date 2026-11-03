use crate::{models::ProxyTransportSettings, storage};
use std::cell::Cell;
use tauri::Runtime;

thread_local! {
    static SETTINGS: Cell<ProxyTransportSettings> = Cell::new(ProxyTransportSettings::default());
}

/// Settings belong to a request worker; async transport copies them before dispatch.
pub(super) struct RequestScope(ProxyTransportSettings);

impl RequestScope {
    pub(super) fn enter(settings: ProxyTransportSettings) -> Self {
        Self(SETTINGS.replace(settings))
    }
}

impl Drop for RequestScope {
    fn drop(&mut self) {
        SETTINGS.set(self.0);
    }
}

pub(super) fn current() -> ProxyTransportSettings {
    SETTINGS.get()
}

pub(super) fn redirect_policy(max_redirects: u32) -> reqwest::redirect::Policy {
    if max_redirects == 0 {
        reqwest::redirect::Policy::none()
    } else {
        reqwest::redirect::Policy::limited(max_redirects as usize)
    }
}

#[tauri::command]
pub(crate) async fn set_proxy_transport<R: Runtime + 'static>(
    app: tauri::AppHandle<R>,
    settings: ProxyTransportSettings,
) -> Result<ProxyTransportSettings, String> {
    // The DTO accepts only unsigned whole counts, including zero.
    tauri::async_runtime::spawn_blocking(move || {
        let mut saved = storage::read_app_settings(&app)
            .map_err(|_| "Connection settings are unavailable. Please try again.".to_string())?;
        saved.proxy_transport = settings;
        storage::write_app_settings(&app, &saved)
            .map_err(|_| "Could not save the connection settings. Please try again.".to_string())?;
        Ok(settings)
    })
    .await
    .map_err(|_| "Could not save the connection settings. Please try again.".to_string())?
}
