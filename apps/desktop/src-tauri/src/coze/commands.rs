use super::{
    install, lifecycle, root,
    state::{CozeState, Status},
    Error,
};
use tauri::Manager;

#[tauri::command]
pub(crate) async fn coze_status(app: tauri::AppHandle) -> Result<Status, String> {
    tauri::async_runtime::spawn_blocking(move || lifecycle::status(&app))
        .await
        .map_err(|_| Error::Storage.to_string())?
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub(crate) async fn coze_install(app: tauri::AppHandle) -> Result<Status, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<CozeState>();
        let _operation = state.begin()?;
        install::install(&root(&app)?, &state)?;
        lifecycle::start(&app)
    })
    .await
    .map_err(|_| Error::Storage.to_string())?
    .map_err(|error| error.to_string())
}

#[tauri::command]
pub(crate) async fn coze_start(app: tauri::AppHandle) -> Result<Status, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<CozeState>();
        let _operation = state.begin()?;
        lifecycle::start(&app)
    })
    .await
    .map_err(|_| Error::Startup.to_string())?
    .map_err(|error| error.to_string())
}

#[tauri::command]
pub(crate) async fn coze_stop(app: tauri::AppHandle) -> Result<Status, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<CozeState>();
        let _operation = state.begin()?;
        lifecycle::stop(&app)
    })
    .await
    .map_err(|_| Error::Startup.to_string())?
    .map_err(|error| error.to_string())
}
