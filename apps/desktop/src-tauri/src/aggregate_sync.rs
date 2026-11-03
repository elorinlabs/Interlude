//! Versioned aggregate configuration transfer. Member IDs remain stable across devices.
use std::{collections::BTreeMap, path::PathBuf, sync::Mutex};

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::{
    aggregate_api::{self, AggregateApiConfig},
    storage::{read_json, write_json_atomic, Paths},
};

static REVISION_LOCK: Mutex<()> = Mutex::new(());
const MAX_ENTRIES: usize = 1000;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AggregateSyncEntry {
    pub(crate) id: String,
    pub(crate) modified_at: DateTime<Utc>,
    /// A missing configuration is a tombstone, retained so an offline device cannot resurrect it.
    pub(crate) config: Option<AggregateApiConfig>,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AggregateSyncPayload {
    #[serde(default)]
    pub(crate) aggregates: Vec<AggregateSyncEntry>,
}

fn revision_path(paths: &Paths) -> Result<PathBuf, String> {
    Ok(paths
        .providers
        .parent()
        .ok_or("Provider store is unavailable")?
        .join("aggregate-revisions.json"))
}

fn read_revisions(paths: &Paths) -> Result<BTreeMap<String, AggregateSyncEntry>, String> {
    let path = revision_path(paths)?;
    if !path.exists() {
        return Ok(BTreeMap::new());
    }
    serde_json::from_value(read_json(&path)?)
        .map_err(|_| "Aggregate revision data is invalid".into())
}

fn write_revisions(
    paths: &Paths,
    entries: &BTreeMap<String, AggregateSyncEntry>,
) -> Result<(), String> {
    let value = serde_json::to_value(entries).map_err(|_| "Could not save aggregate revisions")?;
    write_json_atomic(&revision_path(paths)?, &value)
}

/// Serialize local edits with incoming merges so neither can overwrite the other's configuration.
pub(crate) fn update_configs<T>(
    paths: &Paths,
    update: impl FnOnce(&mut Vec<AggregateApiConfig>) -> Result<T, String>,
) -> Result<T, String> {
    let _guard = REVISION_LOCK
        .lock()
        .map_err(|_| "Aggregate revisions are unavailable")?;
    let mut configs = aggregate_api::read_configs(paths)?;
    let previous = configs.clone();
    let result = update(&mut configs)?;
    if configs == previous {
        return Ok(result);
    }
    let mut entries = read_revisions(paths)?;
    reconcile(&mut entries, &previous);
    reconcile(&mut entries, &configs);
    // Configurations are authoritative after interruption; collect repairs a missing revision write.
    aggregate_api::write_configs(paths, &configs)?;
    write_revisions(paths, &entries)?;
    Ok(result)
}

pub(crate) fn collect(paths: &Paths) -> Result<AggregateSyncPayload, String> {
    let _guard = REVISION_LOCK
        .lock()
        .map_err(|_| "Aggregate revisions are unavailable")?;
    collect_locked(paths)
}

fn collect_locked(paths: &Paths) -> Result<AggregateSyncPayload, String> {
    let mut entries = read_revisions(paths)?;
    reconcile(&mut entries, &aggregate_api::read_configs(paths)?);
    write_revisions(paths, &entries)?;
    Ok(AggregateSyncPayload {
        aggregates: entries.into_values().collect(),
    })
}

fn reconcile(entries: &mut BTreeMap<String, AggregateSyncEntry>, configs: &[AggregateApiConfig]) {
    for config in configs {
        let entry = entries
            .entry(config.id.clone())
            .or_insert_with(|| AggregateSyncEntry {
                id: config.id.clone(),
                modified_at: Utc::now(),
                config: Some(config.clone()),
            });
        if entry.config.as_ref() != Some(config) {
            entry.modified_at =
                Utc::now().max(entry.modified_at + chrono::Duration::milliseconds(1));
            entry.config = Some(config.clone());
        }
    }
    for entry in entries.values_mut() {
        if entry.config.is_some() && !configs.iter().any(|config| config.id == entry.id) {
            entry.modified_at =
                Utc::now().max(entry.modified_at + chrono::Duration::milliseconds(1));
            entry.config = None;
        }
    }
}

pub(crate) fn validate(payload: &AggregateSyncPayload) -> Result<(), String> {
    if payload.aggregates.len() > MAX_ENTRIES {
        return Err("Too many aggregate configurations".into());
    }
    let mut ids = std::collections::HashSet::new();
    for entry in &payload.aggregates {
        if entry.id.is_empty()
            || entry.id.len() > 64
            || !entry
                .id
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '-')
            || !ids.insert(&entry.id)
            || entry.modified_at > Utc::now() + chrono::Duration::minutes(5)
        {
            return Err("Invalid aggregate revision".into());
        }
        if let Some(config) = &entry.config {
            if config.id != entry.id {
                return Err("Aggregate identity does not match its revision".into());
            }
            aggregate_api::validate_imported_config(config)?;
        }
    }
    Ok(())
}

pub(crate) fn apply(paths: &Paths, incoming: AggregateSyncPayload) -> Result<usize, String> {
    validate(&incoming)?;
    let _guard = REVISION_LOCK
        .lock()
        .map_err(|_| "Aggregate revisions are unavailable")?;
    let local = collect_locked(paths)?;
    let mut merged = local
        .aggregates
        .into_iter()
        .map(|e| (e.id.clone(), e))
        .collect::<BTreeMap<_, _>>();
    let mut changed = 0;
    for entry in incoming.aggregates {
        if merged
            .get(&entry.id)
            .is_none_or(|local| should_replace(local, &entry))
        {
            crate::aggregate_scheduler::reset(&entry.id);
            merged.insert(entry.id.clone(), entry);
            changed += 1;
        }
    }
    if changed > 0 {
        let configs = merged
            .values()
            .filter_map(|e| e.config.clone())
            .collect::<Vec<_>>();
        aggregate_api::write_configs(paths, &configs)?;
        write_revisions(paths, &merged)?;
    }
    Ok(changed)
}

fn should_replace(local: &AggregateSyncEntry, remote: &AggregateSyncEntry) -> bool {
    remote.modified_at > local.modified_at
        || (remote.modified_at == local.modified_at
            && remote.config.is_none()
            && local.config.is_some())
}

#[cfg(test)]
mod tests;
