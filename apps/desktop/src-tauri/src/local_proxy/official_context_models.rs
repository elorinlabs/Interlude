//! Fill missing context overrides from actual model metadata before applying their limits.
use std::collections::BTreeMap;

use serde_json::Value;
use tauri::{AppHandle, Runtime};

type ContextWindows = BTreeMap<String, u64>;

pub(super) fn complete<R: Runtime>(
    app: &AppHandle<R>,
    catalog: &mut Value,
    overrides: &ContextWindows,
) -> bool {
    let mut changed = complete_cached(app, catalog, overrides);
    // Explicit refreshes may supplement cached metadata from Admin.
    changed |= complete_from(catalog, overrides, || super::admin_model_catalog(app));
    changed
}

pub(super) fn complete_cached<R: Runtime>(
    app: &AppHandle<R>,
    catalog: &mut Value,
    overrides: &ContextWindows,
) -> bool {
    if !needs_models(catalog, overrides) {
        return false;
    }
    let mut changed = false;
    if let Ok(source) = crate::storage::resolve_paths(app)
        .and_then(|paths| crate::official_models::cached_source_catalog(&paths))
    {
        changed |= append_configured_models(catalog, overrides, &source);
    }
    changed
}

fn complete_from(
    catalog: &mut Value,
    overrides: &ContextWindows,
    load: impl FnOnce() -> Result<Value, String>,
) -> bool {
    if !needs_models(catalog, overrides) {
        return false;
    }
    match load() {
        Ok(source) => append_configured_models(catalog, overrides, &source),
        Err(error) => {
            // Preserve the usable upstream catalog if supplemental discovery is unavailable.
            eprintln!("Could not load missing context model metadata: {error}");
            false
        }
    }
}

fn model_name(model: &Value) -> Option<&str> {
    model["slug"].as_str().or_else(|| model["id"].as_str())
}

fn needs_models(catalog: &Value, overrides: &ContextWindows) -> bool {
    let Some(models) = catalog["models"].as_array() else {
        return false;
    };
    overrides.iter().any(|(name, capacity)| {
        *capacity > 0 && !models.iter().any(|model| model_name(model) == Some(name))
    })
}

pub(super) fn append_configured_models(
    catalog: &mut Value,
    overrides: &ContextWindows,
    source: &Value,
) -> bool {
    let Some(models) = catalog["models"].as_array_mut() else {
        return false;
    };
    let mut changed = false;
    for entry in source["models"].as_array().into_iter().flatten() {
        let Some(name) = model_name(entry) else {
            continue;
        };
        if overrides.get(name).is_none_or(|capacity| *capacity == 0)
            || models.iter().any(|model| model_name(model) == Some(name))
        {
            continue;
        }
        let mut metadata = entry.clone();
        // Supplemental metadata is not evidence that the current account can select this model.
        metadata["visibility"] = "hide".into();
        models.push(metadata);
        changed = true;
    }
    changed
}

#[cfg(test)]
#[path = "tests/official_context_models.rs"]
mod tests;
