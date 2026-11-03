use crate::{models::ResponseHeaderTimeoutSettings, storage};
use std::{cell::Cell, time::Duration};
use tauri::Runtime;

thread_local! {
    static REQUEST_TIMEOUT: Cell<Duration> = Cell::new(ResponseHeaderTimeoutSettings::default().duration());
}

/// Snapshot settings on each request worker; prepared requests retain their own deadline.
pub(super) struct RequestScope(Duration);

impl RequestScope {
    pub(super) fn enter(settings: ResponseHeaderTimeoutSettings) -> Self {
        Self(REQUEST_TIMEOUT.replace(settings.duration()))
    }
}

impl Drop for RequestScope {
    fn drop(&mut self) {
        REQUEST_TIMEOUT.set(self.0);
    }
}

pub(super) fn current() -> Duration {
    REQUEST_TIMEOUT.get()
}

#[tauri::command]
pub(crate) async fn set_response_header_timeout<R: Runtime + 'static>(
    app: tauri::AppHandle<R>,
    settings: ResponseHeaderTimeoutSettings,
) -> Result<ResponseHeaderTimeoutSettings, String> {
    settings.validate().map_err(|error| error.to_string())?;
    tauri::async_runtime::spawn_blocking(move || {
        let mut saved = storage::read_app_settings(&app)
            .map_err(|_| "Could not load the waiting time. Please try again.".to_string())?;
        saved.response_header_timeout = settings;
        storage::write_app_settings(&app, &saved)
            .map_err(|_| "Could not save the waiting time. Please try again.".to_string())?;
        Ok(settings)
    })
    .await
    .map_err(|_| "Could not save the waiting time. Please try again.".to_string())?
}
