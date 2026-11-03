use std::{
    collections::{HashMap, HashSet},
    path::PathBuf,
};

use serde::{Deserialize, Serialize};
use tauri::{Emitter, Runtime};
use uuid::Uuid;

mod active_targets;
mod members;
mod models;
pub(crate) use active_targets::refresh_targets;
use members::validate_member_id;
pub(crate) use members::{member_account_id, read_member_profile, ACCOUNT_MEMBER_PREFIX};
use models::validate_members;
pub(crate) use models::{force_aggregate_model, logical_profile, member_model, member_profiles};

#[cfg(test)]
mod account_tests;
#[cfg(test)]
mod tests;

use crate::{
    aggregate_failover::AggregateFailoverPolicy,
    aggregate_scheduler, local_proxy,
    models::{ModelContextWindows, ModelReasoningEfforts, ProviderKind, ProviderProfile},
    providers,
    storage::{read_json, read_state, resolve_paths, write_json_atomic, Paths},
};

const AGGREGATE_API_FILE_NAME: &str = "aggregate-apis.json";
pub(crate) const ACTIVE_ID_PREFIX: &str = "aggregate:";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AggregateApiConfig {
    pub(crate) id: String,
    pub(crate) name: String,
    pub(crate) model: String,
    pub(crate) member_provider_ids: Vec<String>,
    #[serde(default)]
    pub(crate) member_models: HashMap<String, String>,
    pub(crate) enabled: bool,
    #[serde(default)]
    pub(crate) failover_policy: AggregateFailoverPolicy,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AggregateApiInput {
    id: Option<String>,
    name: String,
    model: String,
    member_provider_ids: Vec<String>,
    #[serde(default)]
    member_models: Option<HashMap<String, String>>,
    enabled: bool,
    #[serde(default)]
    failover_policy: Option<AggregateFailoverPolicy>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AggregateApiSummary {
    id: String,
    name: String,
    model: String,
    member_provider_ids: Vec<String>,
    member_models: HashMap<String, String>,
    enabled: bool,
    active: bool,
    member_conversation_counts: HashMap<String, usize>,
    failover_policy: AggregateFailoverPolicy,
    member_health: HashMap<String, aggregate_scheduler::MemberStateSnapshot>,
}

#[tauri::command]
pub(crate) async fn list_aggregate_apis<R: Runtime + 'static>(
    app: tauri::AppHandle<R>,
) -> Result<Vec<AggregateApiSummary>, String> {
    tauri::async_runtime::spawn_blocking(move || list_summaries(&app))
        .await
        .map_err(|error| format!("Aggregate API list task failed: {error}"))?
}

#[tauri::command]
pub(crate) async fn save_aggregate_api<R: Runtime + 'static>(
    app: tauri::AppHandle<R>,
    aggregate: AggregateApiInput,
) -> Result<AggregateApiSummary, String> {
    tauri::async_runtime::spawn_blocking(move || save_blocking(&app, aggregate))
        .await
        .map_err(|error| format!("Aggregate API save task failed: {error}"))?
}

#[tauri::command]
pub(crate) async fn delete_aggregate_api<R: Runtime + 'static>(
    app: tauri::AppHandle<R>,
    id: String,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || delete_blocking(&app, &id))
        .await
        .map_err(|error| format!("Aggregate API delete task failed: {error}"))?
}

#[tauri::command]
pub(crate) async fn switch_aggregate_api<R: Runtime + 'static>(
    app: tauri::AppHandle<R>,
    id: String,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || switch_blocking(&app, &id))
        .await
        .map_err(|error| format!("Aggregate API switch task failed: {error}"))?
}

pub(crate) fn is_active_id(id: &str) -> bool {
    id.starts_with(ACTIVE_ID_PREFIX)
}

pub(crate) fn config_id_from_active_id(id: &str) -> Option<&str> {
    id.strip_prefix(ACTIVE_ID_PREFIX)
}

pub(crate) fn active_id(id: &str) -> String {
    format!("{ACTIVE_ID_PREFIX}{id}")
}

pub(crate) fn read_active_config(
    paths: &Paths,
    active_provider_id: &str,
) -> Result<AggregateApiConfig, String> {
    let id = config_id_from_active_id(active_provider_id)
        .ok_or_else(|| "Aggregate API id is invalid".to_string())?;
    read_config(paths, id)
}

pub(crate) fn read_config(paths: &Paths, id: &str) -> Result<AggregateApiConfig, String> {
    validate_id(id)?;
    read_configs(paths)?
        .into_iter()
        .find(|aggregate| aggregate.id == id)
        .ok_or_else(|| "Aggregate API does not exist".to_string())
}

pub(crate) fn remove_provider_membership(paths: &Paths, provider_id: &str) -> Result<(), String> {
    let changed = crate::aggregate_sync::update_configs(paths, |configs| {
        let mut changed = Vec::new();
        for aggregate in configs {
            if !aggregate
                .member_provider_ids
                .iter()
                .any(|id| id == provider_id)
            {
                continue;
            }
            aggregate.member_provider_ids.retain(|id| id != provider_id);
            aggregate.member_models.remove(provider_id);
            aggregate.enabled &= aggregate.member_provider_ids.len() >= 2;
            changed.push(aggregate.id.clone());
        }
        Ok(changed)
    })?;
    for id in changed {
        aggregate_scheduler::reset(&id);
    }
    Ok(())
}

fn list_summaries<R: Runtime>(
    app: &tauri::AppHandle<R>,
) -> Result<Vec<AggregateApiSummary>, String> {
    let paths = resolve_paths(app)?;
    let active_provider_id = read_state(&paths).active_provider_id;
    let active_session_ids = local_proxy::active_proxy_session_ids()?;
    let mut summaries = read_configs(&paths)?
        .into_iter()
        .map(|aggregate| {
            summary(
                aggregate,
                active_provider_id.as_deref(),
                &active_session_ids,
            )
        })
        .collect::<Result<Vec<_>, _>>()?;
    summaries.sort_by(|left, right| left.name.cmp(&right.name));
    Ok(summaries)
}

fn save_blocking<R: Runtime>(
    app: &tauri::AppHandle<R>,
    input: AggregateApiInput,
) -> Result<AggregateApiSummary, String> {
    let paths = resolve_paths(app)?;
    let config = crate::aggregate_sync::update_configs(&paths, |configs| {
        let config = normalize_update(input, &paths, configs)?;
        if let Some(existing) = configs
            .iter_mut()
            .find(|aggregate| aggregate.id == config.id)
        {
            *existing = config.clone();
        } else {
            configs.push(config.clone());
        }
        Ok(config)
    })?;
    let id = config.id.clone();
    aggregate_scheduler::reset(&id);

    let expected_active_id = active_id(&id);
    let active = read_state(&paths).active_provider_id.as_deref() == Some(&expected_active_id);
    if active && config.enabled {
        activate_config(app, &paths, &config)?;
    } else if active {
        providers::disable_provider_blocking(app.clone())?;
    }
    emit_changed(app)?;
    summary(
        config,
        read_state(&paths).active_provider_id.as_deref(),
        &local_proxy::active_proxy_session_ids()?,
    )
}

fn delete_blocking<R: Runtime>(app: &tauri::AppHandle<R>, id: &str) -> Result<(), String> {
    validate_id(id)?;
    let paths = resolve_paths(app)?;
    let expected_active_id = active_id(id);
    let was_active = read_state(&paths).active_provider_id.as_deref() == Some(&expected_active_id);
    crate::aggregate_sync::update_configs(&paths, |configs| {
        let previous_len = configs.len();
        configs.retain(|aggregate| aggregate.id != id);
        if configs.len() == previous_len {
            return Err("Aggregate API does not exist".to_string());
        }
        Ok(())
    })?;
    aggregate_scheduler::reset(id);
    if was_active {
        providers::disable_provider_blocking(app.clone())?;
    }
    emit_changed(app)
}

pub(crate) fn switch_blocking<R: Runtime>(
    app: &tauri::AppHandle<R>,
    id: &str,
) -> Result<(), String> {
    let paths = resolve_paths(app)?;
    let config = read_config(&paths, id)?;
    if !config.enabled {
        return Err("Enable the aggregate API before using it".to_string());
    }
    activate_config(app, &paths, &config)?;
    emit_changed(app)
}

pub(crate) fn activate_config<R: Runtime>(
    app: &tauri::AppHandle<R>,
    paths: &Paths,
    config: &AggregateApiConfig,
) -> Result<(), String> {
    let profiles = member_profiles(paths, config)?;
    for profile in &profiles {
        providers::validate_provider_activation(profile)?;
    }
    let profile = logical_profile(config, &profiles)?;
    providers::activate_logical_provider(app, paths, &profile)
}

fn normalize_update(
    mut input: AggregateApiInput,
    paths: &Paths,
    configs: &[AggregateApiConfig],
) -> Result<AggregateApiConfig, String> {
    let id = input
        .id
        .clone()
        .unwrap_or_else(|| Uuid::new_v4().to_string());
    validate_id(&id)?;
    if input.failover_policy.is_none() {
        input.failover_policy = configs
            .iter()
            .find(|config| config.id == id)
            .map(|config| config.failover_policy.clone());
    }
    if input.member_models.is_none() {
        input.member_models = configs
            .iter()
            .find(|config| config.id == id)
            .map(|config| config.member_models.clone());
    }
    normalize_input(id, input, paths)
}

fn normalize_input(
    id: String,
    input: AggregateApiInput,
    paths: &Paths,
) -> Result<AggregateApiConfig, String> {
    let name = require_value("Aggregate API name", &input.name)?;
    let model = require_value("Model", &input.model)?;
    let member_provider_ids = unique_members(input.member_provider_ids)?;
    let profiles = member_provider_ids
        .iter()
        .map(|provider_id| read_member_profile(paths, provider_id))
        .collect::<Result<Vec<_>, _>>()?;
    let mut member_models = input.member_models.unwrap_or_default();
    member_models.retain(|id, _| member_provider_ids.contains(id));
    for model in member_models.values_mut() {
        *model = require_value("Member model", model)?;
    }
    let mut failover_policy = input.failover_policy.unwrap_or_default();
    failover_policy
        .normalize()
        .map_err(|error| error.to_string())?;
    let config = AggregateApiConfig {
        id,
        name,
        model,
        member_provider_ids,
        member_models,
        enabled: input.enabled,
        failover_policy,
    };
    validate_imported_config(&config)?;
    validate_members(&config, &profiles)?;
    Ok(config)
}

fn unique_members(member_provider_ids: Vec<String>) -> Result<Vec<String>, String> {
    let mut seen = HashSet::new();
    let members = member_provider_ids
        .into_iter()
        .map(|id| id.trim().to_string())
        .filter(|id| !id.is_empty() && seen.insert(id.clone()))
        .collect::<Vec<_>>();
    if members.len() < 2 {
        return Err("Select at least two APIs for the aggregate".to_string());
    }
    Ok(members)
}

fn summary(
    config: AggregateApiConfig,
    active_provider_id: Option<&str>,
    active_session_ids: &HashSet<String>,
) -> Result<AggregateApiSummary, String> {
    let expected_active_id = active_id(&config.id);
    let member_conversation_counts = aggregate_scheduler::conversation_counts(
        &config.id,
        &config.member_provider_ids,
        active_session_ids,
    )?;
    let member_health =
        aggregate_scheduler::member_states(&config.id, &config.member_provider_ids)?;
    Ok(AggregateApiSummary {
        active: active_provider_id == Some(&expected_active_id),
        id: config.id,
        name: config.name,
        model: config.model,
        member_provider_ids: config.member_provider_ids,
        member_models: config.member_models,
        enabled: config.enabled,
        member_conversation_counts,
        failover_policy: config.failover_policy,
        member_health,
    })
}

pub(crate) fn read_configs(paths: &Paths) -> Result<Vec<AggregateApiConfig>, String> {
    let path = store_path(paths)?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    let configs: Vec<AggregateApiConfig> = serde_json::from_value(read_json(&path)?)
        .map_err(|error| format!("Aggregate API configuration is invalid: {error}"))?;
    for config in &configs {
        config
            .failover_policy
            .validate()
            .map_err(|error| error.to_string())?;
    }
    Ok(configs)
}

pub(crate) fn write_configs(paths: &Paths, configs: &[AggregateApiConfig]) -> Result<(), String> {
    let value = serde_json::to_value(configs).map_err(|error| error.to_string())?;
    write_json_atomic(&store_path(paths)?, &value)
}

pub(crate) fn validate_imported_config(config: &AggregateApiConfig) -> Result<(), String> {
    validate_id(&config.id)?;
    require_value("Aggregate API name", &config.name)?;
    require_value("Model", &config.model)?;
    config
        .failover_policy
        .validate()
        .map_err(|error| error.to_string())?;
    if config.member_provider_ids.len() > 100
        || (config.enabled && config.member_provider_ids.len() < 2)
    {
        return Err("Select between two and 100 APIs for the aggregate".into());
    }
    let mut members = HashSet::new();
    for id in &config.member_provider_ids {
        validate_member_id(id)?;
        if !members.insert(id) {
            return Err("Aggregate API members must be unique".into());
        }
    }
    for (id, model) in &config.member_models {
        if !members.contains(id)
            || model.trim().is_empty()
            || model.len() > 256
            || model.chars().any(char::is_control)
        {
            return Err("An aggregate member model is invalid".into());
        }
    }
    Ok(())
}

fn store_path(paths: &Paths) -> Result<PathBuf, String> {
    paths
        .providers
        .parent()
        .map(|parent| parent.join(AGGREGATE_API_FILE_NAME))
        .ok_or_else(|| "Provider store does not have a parent directory".to_string())
}

fn require_value(label: &str, value: &str) -> Result<String, String> {
    let value = value.trim();
    if value.is_empty() {
        Err(format!("{label} is required"))
    } else if value.len() > 256 || value.chars().any(char::is_control) {
        Err(format!(
            "{label} is too long or contains invalid characters"
        ))
    } else {
        Ok(value.to_string())
    }
}

fn validate_id(id: &str) -> Result<(), String> {
    let valid = !id.is_empty()
        && id.len() <= 64
        && id
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || character == '-');
    if valid {
        Ok(())
    } else {
        Err("Aggregate API id is invalid".to_string())
    }
}

fn emit_changed<R: Runtime>(app: &tauri::AppHandle<R>) -> Result<(), String> {
    crate::codex_gui::account_selection::refresh_aggregate_selection(app)
        .map_err(|error| error.to_string())?;
    app.emit("aggregate-apis-changed", ())
        .map_err(|error| error.to_string())?;
    app.emit("providers-changed", ())
        .map_err(|error| error.to_string())
}
