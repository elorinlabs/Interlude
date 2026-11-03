//! Restore the GUI picker from its account-scoped CLI cache without requesting discovery.
use std::{
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
};

use serde::{Deserialize, Serialize};
use serde_json::json;

use super::{
    error::{GuiError, Result},
    protocol::GuiResponse,
};

#[derive(Deserialize)]
struct Catalog {
    models: Vec<CachedModel>,
}

#[derive(Deserialize)]
struct CachedModel {
    slug: String,
    #[serde(default)]
    display_name: String,
    #[serde(default)]
    visibility: String,
    #[serde(default)]
    default_reasoning_level: Option<String>,
    #[serde(default)]
    supported_reasoning_levels: Vec<ReasoningLevel>,
    #[serde(default)]
    priority: i64,
}

#[derive(Deserialize, Serialize)]
struct ReasoningLevel {
    #[serde(rename(serialize = "reasoningEffort", deserialize = "effort"))]
    effort: String,
    #[serde(default)]
    description: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Model {
    id: String,
    model: String,
    display_name: String,
    is_default: bool,
    default_reasoning_effort: String,
    supported_reasoning_efforts: Vec<ReasoningLevel>,
}

pub(super) fn read(home: &Path, cursor: Option<String>) -> Result<GuiResponse> {
    if cursor.is_some() {
        return Err(GuiError::InvalidRequest);
    }
    let catalog: Catalog =
        serde_json::from_value(load_catalog(home)?).map_err(|_| GuiError::ModelCatalog)?;
    response(catalog)
}

/// Return only the GUI source cache; never fall back to a different account or network.
pub(crate) fn cached_catalog(home: &Path) -> std::result::Result<serde_json::Value, String> {
    load_catalog(home).map_err(|error| error.to_string())
}

fn load_catalog(home: &Path) -> Result<serde_json::Value> {
    let bytes = match fs::read(catalog_path(home)?) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(json!({ "models": [] }));
        }
        Err(_) => return Err(GuiError::ModelCatalog),
    };
    serde_json::from_slice(&bytes).map_err(|_| GuiError::ModelCatalog)
}

fn catalog_path(home: &Path) -> Result<PathBuf> {
    let config = match fs::read_to_string(home.join("config.toml")) {
        Ok(config) => config,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => String::new(),
        Err(_) => return Err(GuiError::ModelCatalog),
    };
    let config = config
        .parse::<toml_edit::DocumentMut>()
        .map_err(|_| GuiError::ModelCatalog)?;
    Ok(config
        .get("model_catalog_json")
        .and_then(|item| item.as_str())
        .map(|path| home.join(path))
        .unwrap_or_else(|| home.join("models_cache.json")))
}

/// Expire only the CLI timestamp so an explicit refresh bypasses its TTL without losing data.
pub(super) fn expire(home: &Path) -> Result<()> {
    let path = home.join("models_cache.json");
    let bytes = match fs::read(&path) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(_) => return Err(GuiError::ModelCatalog),
    };
    // Let the CLI recover corrupt caches itself; do not overwrite unreadable contents here.
    let Ok(mut catalog) = serde_json::from_slice::<serde_json::Value>(&bytes) else {
        return Ok(());
    };
    if !catalog.is_object() {
        return Ok(());
    }
    catalog["fetched_at"] = json!("2000-01-01T00:00:00Z");
    crate::storage::write_json_atomic(&path, &catalog).map_err(|_| GuiError::ModelCatalog)
}

fn response(mut catalog: Catalog) -> Result<GuiResponse> {
    catalog.models.sort_by_key(|model| model.priority);
    let mut seen = HashSet::new();
    let models: Vec<Model> = catalog
        .models
        .into_iter()
        .filter(|entry| entry.visibility != "hide" && !entry.slug.trim().is_empty())
        .filter(|entry| seen.insert(entry.slug.clone()))
        .enumerate()
        .map(|(index, entry)| Model {
            id: entry.slug.clone(),
            display_name: if entry.display_name.is_empty() {
                entry.slug.clone()
            } else {
                entry.display_name
            },
            model: entry.slug,
            is_default: index == 0,
            default_reasoning_effort: entry
                .default_reasoning_level
                .unwrap_or_else(|| "medium".into()),
            supported_reasoning_efforts: entry.supported_reasoning_levels,
        })
        .collect();
    Ok(GuiResponse {
        data: json!({ "data": models, "nextCursor": null }),
    })
}

#[cfg(test)]
#[path = "model_catalog_cache_tests.rs"]
mod tests;
