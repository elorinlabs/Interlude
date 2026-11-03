use std::{
    sync::{Arc, Mutex, Once},
    thread,
    time::{Duration, Instant},
};

use serde_json::Value;
use tauri::AppHandle;

use super::{data, set_state, DockState};
use crate::models::ProviderBalance;

const REFRESH_INTERVAL: Duration = Duration::from_millis(2500);
const BALANCE_INTERVAL: Duration = Duration::from_secs(60);
static START: Once = Once::new();

#[derive(Default)]
struct BalanceState {
    key: String,
    value: Option<ProviderBalance>,
    failed: bool,
    attempted: Option<Instant>,
    pending: bool,
    generation: u64,
}

type BalanceCache = Arc<Mutex<BalanceState>>;

pub(super) fn start(app: AppHandle) {
    START.call_once(|| {
        thread::Builder::new()
            .name("codex-pet-dock".into())
            .spawn(move || {
                let balance = BalanceCache::default();
                let mut was_enabled = false;
                loop {
                    if iteration(&app, &balance, &mut was_enabled).is_err() {
                        set_state(DockState::Unavailable);
                    }
                    thread::sleep(REFRESH_INTERVAL);
                }
            })
            .expect("failed to start pet dock monitor");
    });
}

fn iteration(
    app: &AppHandle,
    balance: &BalanceCache,
    was_enabled: &mut bool,
) -> Result<(), String> {
    let settings = crate::storage::read_app_settings(app)?;
    if !settings.pet_dock_enabled {
        if *was_enabled {
            let _ = sync(None);
        }
        *was_enabled = false;
        set_state(DockState::Disabled);
        return Ok(());
    }
    *was_enabled = true;
    let average_preference = settings.quota_display_all_accounts;
    let mut snapshot = load_snapshot(app, balance, average_preference)
        .unwrap_or_else(|_| data::unavailable("official"));
    // A slow database read must not re-enable a dock after its switch was turned off.
    let settings = crate::storage::read_app_settings(app)?;
    if !settings.pet_dock_enabled || average_preference != settings.quota_display_all_accounts {
        return Ok(());
    }
    snapshot["language"] = serde_json::to_value(settings.language).unwrap_or_default();
    snapshot["showLabels"] = settings.pet_dock_show_labels.into();
    set_state(sync(Some(&snapshot))?);
    Ok(())
}

fn load_snapshot(app: &AppHandle, balance: &BalanceCache, average: bool) -> Result<Value, String> {
    let paths = crate::storage::resolve_paths(app)?;
    let state = crate::storage::read_state(&paths);
    let mut snapshot = if should_use_average(&state, average) {
        let average = crate::quota_display::load_average(&paths)?;
        let mut snapshot = data::official(&average.usage, chrono::Utc::now().timestamp());
        snapshot["average"] = true.into();
        snapshot["stale"] = average.stale.into();
        snapshot
    } else if state.concurrent_account_routing_enabled || state.active_provider_group.is_some() {
        data::unavailable("official")
    } else if let Some(id) = state.active_provider_id.as_deref() {
        provider_snapshot(app, balance, id)?
    } else if let Some(id) = state.active_account_id.as_deref() {
        data::official(
            &crate::storage::load_usage(&crate::storage::usage_path(&paths, id)),
            chrono::Utc::now().timestamp(),
        )
    } else {
        data::unavailable("official")
    };
    let latest = crate::storage::read_state(&paths);
    if latest.active_provider_id != state.active_provider_id
        || latest.active_account_id != state.active_account_id
        || latest.active_provider_group != state.active_provider_group
        || latest.concurrent_account_routing_enabled != state.concurrent_account_routing_enabled
    {
        snapshot = data::unavailable("official");
    }
    Ok(snapshot)
}

fn should_use_average(state: &crate::models::ManagerStateFile, enabled: bool) -> bool {
    enabled
        && state.active_provider_id.is_none()
        && state.active_provider_group.is_none()
        && !state.concurrent_account_routing_enabled
        && state.active_account_id.is_some()
}

fn provider_snapshot(app: &AppHandle, cache: &BalanceCache, id: &str) -> Result<Value, String> {
    let paths = crate::storage::resolve_paths(app)?;
    let provider = crate::providers::read_provider(&paths, id)?;
    // Configuration changes invalidate the entry, without retaining or publishing credentials.
    use sha2::{Digest, Sha256};
    let key = format!(
        "{:x}",
        Sha256::digest(serde_json::to_vec(&provider).map_err(|error| error.to_string())?)
    );
    let mut balance = cache.lock().unwrap_or_else(|error| error.into_inner());
    if balance.key != key {
        *balance = BalanceState {
            key: key.clone(),
            generation: balance.generation.wrapping_add(1),
            ..Default::default()
        };
    }
    if provider.balance_platform.is_some()
        && !balance.pending
        && balance
            .attempted
            .is_none_or(|time| time.elapsed() >= BALANCE_INTERVAL)
    {
        balance.attempted = Some(Instant::now());
        balance.pending = true;
        schedule_balance(
            app.clone(),
            id.to_string(),
            balance.generation,
            Arc::clone(cache),
        );
    }
    if provider.balance_platform.is_none() {
        balance.failed = true;
    }
    drop(balance);
    let tokens = data::read_tokens(app, id, &provider.name);
    let balance = cache.lock().unwrap_or_else(|error| error.into_inner());
    Ok(data::api(balance.value.as_ref(), tokens, balance.failed))
}

fn schedule_balance(app: AppHandle, id: String, generation: u64, cache: BalanceCache) {
    tauri::async_runtime::spawn(async move {
        let result = crate::providers::query_provider_balance(app, id).await;
        let mut balance = cache.lock().unwrap_or_else(|error| error.into_inner());
        if balance.generation != generation {
            return;
        }
        balance.pending = false;
        match result {
            Ok(value) => {
                balance.value = Some(value);
                balance.failed = false;
            }
            Err(_) => {
                balance.failed = true;
            }
        }
    });
}

fn sync(snapshot: Option<&Value>) -> Result<DockState, String> {
    #[cfg(any(target_os = "windows", target_os = "macos"))]
    {
        crate::dream_skin_native::sync_pet_dock(snapshot)
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        let _ = snapshot;
        Ok(DockState::Unsupported)
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn average_mode_only_applies_to_an_active_official_account() {
        let official = crate::models::ManagerStateFile {
            active_account_id: Some("account-1".into()),
            ..Default::default()
        };
        assert!(super::should_use_average(&official, true));
        assert!(!super::should_use_average(&official, false));

        let api_provider = crate::models::ManagerStateFile {
            active_account_id: Some("account-1".into()),
            active_provider_id: Some("provider-1".into()),
            ..Default::default()
        };
        assert!(!super::should_use_average(&api_provider, true));

        let concurrent = crate::models::ManagerStateFile {
            active_account_id: Some("account-1".into()),
            concurrent_account_routing_enabled: true,
            ..Default::default()
        };
        assert!(!super::should_use_average(&concurrent, true));

        let provider_group = crate::models::ManagerStateFile {
            active_account_id: Some("account-1".into()),
            active_provider_group: Some("api-group".into()),
            ..Default::default()
        };
        assert!(!super::should_use_average(&provider_group, true));
        assert!(!super::should_use_average(&Default::default(), true));
    }
}
