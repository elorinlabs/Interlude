//! Optional quota display attached to the official Codex pet.
use std::sync::{Mutex, OnceLock};

use serde::Serialize;
use tauri::AppHandle;

mod data;
mod worker;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum DockState {
    #[default]
    Disabled,
    WaitingForCodex,
    WaitingForPet,
    Active,
    Unavailable,
    Unsupported,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PetDockStatus {
    enabled: bool,
    show_labels: bool,
    state: DockState,
}

static STATUS: OnceLock<Mutex<DockState>> = OnceLock::new();

fn set_state(state: DockState) {
    *STATUS
        .get_or_init(Mutex::default)
        .lock()
        .unwrap_or_else(|error| error.into_inner()) = state;
}

fn status(app: &AppHandle) -> Result<PetDockStatus, String> {
    let settings = crate::storage::read_app_settings(app)?;
    let enabled = settings.pet_dock_enabled;
    let state = if !cfg!(any(target_os = "windows", target_os = "macos")) {
        DockState::Unsupported
    } else if !enabled {
        DockState::Disabled
    } else {
        let state = *STATUS
            .get_or_init(Mutex::default)
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        if state == DockState::Disabled {
            DockState::WaitingForCodex
        } else {
            state
        }
    };
    Ok(PetDockStatus {
        enabled,
        show_labels: settings.pet_dock_show_labels,
        state,
    })
}

#[tauri::command]
pub(crate) async fn get_pet_dock_status(app: AppHandle) -> Result<PetDockStatus, String> {
    tauri::async_runtime::spawn_blocking(move || status(&app))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub(crate) async fn set_pet_dock_enabled(
    app: AppHandle,
    enabled: bool,
) -> Result<PetDockStatus, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut settings = crate::storage::read_app_settings(&app)?;
        settings.pet_dock_enabled = enabled;
        crate::storage::write_app_settings(&app, &settings)?;
        status(&app)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub(crate) async fn set_pet_dock_labels_visible(
    app: AppHandle,
    show_labels: bool,
) -> Result<PetDockStatus, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut settings = crate::storage::read_app_settings(&app)?;
        settings.pet_dock_show_labels = show_labels;
        crate::storage::write_app_settings(&app, &settings)?;
        status(&app)
    })
    .await
    .map_err(|error| error.to_string())?
}

pub(crate) fn setup(app: AppHandle) {
    worker::start(app);
}
