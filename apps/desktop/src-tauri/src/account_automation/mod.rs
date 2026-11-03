//! Local opt-in account scheduling, independent of the old dashboard and proxy services.
mod goals;
mod rpc;
mod scheduler;
pub(crate) mod token_history;
mod widget;
mod widget_config;

use interlude_account_switch::automation::PreheatPlan;
use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    sync::{
        atomic::{AtomicI64, Ordering},
        Arc, Mutex,
    },
};
use tauri::{Emitter, Manager};

#[derive(Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", default)]
pub(crate) struct AutomationConfig {
    pub widget_enabled: bool,
    pub widget_provider: Option<String>,
    pub widget_models: Vec<String>,
    pub preheat_ids: Vec<String>,
    pub relay: Option<RelayConfig>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RelayConfig {
    pub thread_id: String,
    pub account_ids: Vec<String>,
}

#[derive(Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", default)]
pub(crate) struct Stored {
    pub config: AutomationConfig,
    pub plans: BTreeMap<String, PreheatPlan>,
    pub relay_status: String,
    pub relay_goal_id: Option<String>,
    pub relay_attempt_at: i64,
    pub relay_phase: Option<String>,
    pub relay_target: Option<String>,
    pub last_refresh_at: i64,
    pub refresh_status: String,
}

#[derive(Default)]
pub(crate) struct AutomationState {
    inner: Mutex<Stored>,
    refresh_after: AtomicI64,
}

fn valid_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 200
        && value
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || c == b'-' || c == b'_')
}
fn state_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|_| "automationFailed")?
        .join("account-automation.json"))
}
fn snapshot(app: &tauri::AppHandle) -> Stored {
    app.state::<Arc<AutomationState>>()
        .inner
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clone()
}
fn update(app: &tauri::AppHandle, change: impl FnOnce(&mut Stored)) -> Result<Stored, String> {
    let managed = app.state::<Arc<AutomationState>>();
    let mut state = managed.inner.lock().map_err(|_| "automationFailed")?;
    let mut next = state.clone();
    change(&mut next);
    let value = serde_json::to_value(&next).map_err(|_| "automationFailed")?;
    crate::storage::write_json_atomic(&state_path(app)?, &value).map_err(|_| "automationFailed")?;
    *state = next.clone();
    drop(state);
    let _ = app.emit("interlude-state-updated", ());
    Ok(next)
}
pub(crate) fn background_required(app: &tauri::AppHandle) -> bool {
    let state = snapshot(app);
    state.config.widget_enabled
        || !state.config.preheat_ids.is_empty()
        || state.config.relay.is_some()
}

pub(crate) fn request_usage_refresh<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    app.state::<Arc<AutomationState>>()
        .refresh_after
        .store(0, Ordering::Relaxed);
}

pub(crate) fn setup(app: &tauri::AppHandle) -> Result<(), String> {
    let mut stored = std::fs::read(state_path(app)?)
        .ok()
        .and_then(|bytes| serde_json::from_slice::<Stored>(&bytes).ok())
        .unwrap_or_default();
    widget_config::normalize(
        &mut stored.config.widget_provider,
        &mut stored.config.widget_models,
    );
    for plan in stored.plans.values_mut() {
        if !plan.in_flight {
            plan.retry_at = plan.retry_at.min(chrono::Utc::now().timestamp());
        }
    }
    for plan in stored.plans.values_mut().filter(|plan| plan.in_flight) {
        plan.status = "uncertain".into();
    }
    // Resume a recorded handover only from its explicit phase; never switch twice after a crash.
    if stored.relay_phase.is_some() {
        stored.relay_status = "recovering".into();
    }
    app.state::<Arc<AutomationState>>()
        .inner
        .lock()
        .map_err(|_| "automationFailed")?
        .clone_from(&stored);
    widget::setup_tray(app)?;
    if stored.config.widget_enabled {
        widget::open(app)?;
    }
    let worker_app = app.clone();
    tauri::async_runtime::spawn(async move {
        scheduler::run(worker_app).await;
    });
    Ok(())
}

#[tauri::command]
pub(crate) async fn get_local_automation(app: tauri::AppHandle) -> Result<Stored, String> {
    Ok(snapshot(&app))
}

#[tauri::command]
pub(crate) async fn save_local_automation(
    app: tauri::AppHandle,
    mut config: AutomationConfig,
) -> Result<Stored, String> {
    if config
        .widget_provider
        .as_deref()
        .is_some_and(|p| !matches!(p, "codex" | "antigravity"))
        || config.widget_models.len() > 100
        || config
            .widget_models
            .iter()
            .any(|m| m.is_empty() || m.len() > 500)
    {
        return Err("automationFailed".into());
    }
    widget_config::normalize(&mut config.widget_provider, &mut config.widget_models);
    config.preheat_ids.sort();
    config.preheat_ids.dedup();
    if config.preheat_ids.len() > 500 || config.preheat_ids.iter().any(|id| !valid_id(id)) {
        return Err("automationFailed".into());
    }
    if let Some(relay) = &mut config.relay {
        relay.account_ids.sort();
        relay.account_ids.dedup();
        if uuid::Uuid::parse_str(&relay.thread_id).is_err()
            || relay.account_ids.is_empty()
            || relay.account_ids.len() > 500
            || relay.account_ids.iter().any(|id| !valid_id(id))
        {
            return Err("automationFailed".into());
        }
    }
    let write_app = app.clone();
    let next_config = config.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let now = chrono::Utc::now().timestamp();
        let goal_id = next_config
            .relay
            .as_ref()
            .map(|relay| {
                let goal = goals::read_goal(&write_app, &relay.thread_id)?;
                if matches!(goal.status.as_str(), "complete" | "budget_limited") {
                    return Err("goalNotResumable".to_string());
                }
                Ok(goal.goal_id)
            })
            .transpose()?;
        update(&write_app, |state| {
            let changed_target = state.config.relay.as_ref().map(|r| &r.thread_id)
                != next_config.relay.as_ref().map(|r| &r.thread_id);
            state
                .plans
                .retain(|id, _| next_config.preheat_ids.contains(id));
            for id in &next_config.preheat_ids {
                state
                    .plans
                    .entry(id.clone())
                    .or_insert_with(|| PreheatPlan {
                        next_at: now,
                        status: "scheduled".into(),
                        ..Default::default()
                    });
            }
            if changed_target {
                state.relay_phase = None;
                state.relay_target = None;
                state.relay_attempt_at = 0;
            }
            state.relay_goal_id = goal_id;
            state.config = next_config;
            state.relay_status = if state.config.relay.is_some() {
                "watching"
            } else {
                "off"
            }
            .into();
        })
    })
    .await
    .map_err(|_| "automationFailed")??;
    if config.widget_enabled {
        if let Err(error) = widget::open(&app) {
            let rollback = app.clone();
            let _ = tauri::async_runtime::spawn_blocking(move || {
                update(&rollback, |state| state.config.widget_enabled = false)
            })
            .await;
            return Err(error);
        }
    } else {
        widget::close(&app);
    }
    app.state::<Arc<AutomationState>>()
        .refresh_after
        .store(0, Ordering::Relaxed);
    Ok(result)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WidgetAccount {
    id: String,
    email: String,
    usage: crate::models::UsageSummary,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WidgetSnapshot {
    account: Option<WidgetAccount>,
    refresh_status: String,
    provider: String,
}
#[tauri::command]
pub(crate) async fn get_account_widget(app: tauri::AppHandle) -> Result<WidgetSnapshot, String> {
    let state = snapshot(&app);
    tauri::async_runtime::spawn_blocking(move || {
        let accounts = crate::commands::list_accounts_blocking(app)?;
        Ok(WidgetSnapshot {
            account: accounts
                .into_iter()
                .find(|account| account.active)
                .map(|account| WidgetAccount {
                    id: account.id,
                    email: account.email,
                    usage: account.usage,
                }),
            refresh_status: state.refresh_status,
            provider: "codex".into(),
        })
    })
    .await
    .map_err(|_| "automationFailed")?
}
#[tauri::command]
pub(crate) fn show_account_manager(app: tauri::AppHandle) -> Result<(), String> {
    widget::show_main(&app)
}
#[tauri::command]
pub(crate) fn quit_interlude(app: tauri::AppHandle) {
    app.exit(0);
}
#[tauri::command]
pub(crate) async fn list_local_goals(
    app: tauri::AppHandle,
) -> Result<Vec<goals::LocalGoal>, String> {
    tauri::async_runtime::spawn_blocking(move || goals::list(&app))
        .await
        .map_err(|_| "automationFailed")?
}
