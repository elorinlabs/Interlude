//! Shared all-account quota display; never refreshes credentials or changes routing/accounting.
use serde::Serialize;
use tauri::{AppHandle, Runtime};

use crate::models::{AppSettings, UsageSummary};

mod average;
pub(crate) use average::load_average;

#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct QuotaAverage {
    pub(crate) usage: UsageSummary,
    pub(crate) total_accounts: usize,
    pub(crate) primary_accounts: usize,
    pub(crate) secondary_accounts: usize,
    pub(crate) stale: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct QuotaDisplayStatus {
    enabled: bool,
    average: Option<QuotaAverage>,
}

fn read_status<R: Runtime>(app: &AppHandle<R>) -> Result<QuotaDisplayStatus, String> {
    let enabled = crate::storage::read_app_settings(app)?.quota_display_all_accounts;
    let average = if enabled {
        Some(load_average(&crate::storage::resolve_paths(app)?)?)
    } else {
        None
    };
    Ok(QuotaDisplayStatus { enabled, average })
}

#[tauri::command]
pub(crate) async fn get_quota_display_status<R: Runtime>(
    app: AppHandle<R>,
) -> Result<QuotaDisplayStatus, String> {
    tauri::async_runtime::spawn_blocking(move || read_status(&app))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub(crate) async fn set_quota_display_all_accounts<R: Runtime>(
    app: AppHandle<R>,
    enabled: bool,
) -> Result<AppSettings, String> {
    tauri::async_runtime::spawn_blocking(move || {
        crate::storage::update_quota_display(&app, enabled)
    })
    .await
    .map_err(|error| error.to_string())?
}
