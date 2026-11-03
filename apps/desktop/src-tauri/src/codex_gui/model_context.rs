//! GUI model defaults are separate from proxy settings and per-conversation overrides.
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{collections::BTreeMap, fs, path::Path, sync::Mutex};
use tauri::{AppHandle, Manager, Runtime};

const FILE_NAME: &str = "codex-gui-model-context.json";
const MIN_CAPACITY: u64 = 1_000;
const MAX_CAPACITY: u64 = 100_000_000;
const MAX_MODELS: usize = 2_000;
static STORAGE: Mutex<()> = Mutex::new(());
type Capacities = BTreeMap<String, u64>;
type Result<T> = std::result::Result<T, ContextError>;

#[derive(Debug, thiserror::Error)]
pub(crate) enum ContextError {
    #[error("暂时无法读取或保存模型上下文设置，请重试。")]
    Storage,
    #[error("请输入 1 至 100000 K 之间的上下文容量。")]
    InvalidCapacity,
    #[error("模型名称无效，请重新输入。")]
    InvalidModel,
}

#[derive(Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", default, deny_unknown_fields)]
pub(crate) struct ModelContextSettings {
    defaults: Capacities,
    overrides: Capacities,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ModelContextSnapshot {
    #[serde(flatten)]
    settings: ModelContextSettings,
    using_cached_defaults: bool,
}

fn validate_capacity(capacity: u64) -> Result<()> {
    if !(MIN_CAPACITY..=MAX_CAPACITY).contains(&capacity) {
        return Err(ContextError::InvalidCapacity);
    }
    Ok(())
}

fn read(path: &Path) -> Result<ModelContextSettings> {
    let bytes = match fs::read(path) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Default::default()),
        Err(_) => return Err(ContextError::Storage),
    };
    let settings: ModelContextSettings =
        serde_json::from_slice(&bytes).map_err(|_| ContextError::Storage)?;
    for capacities in [&settings.defaults, &settings.overrides] {
        if capacities.len() > MAX_MODELS {
            return Err(ContextError::Storage);
        }
        for (model, capacity) in capacities {
            super::model_settings::validate_model(model).map_err(|_| ContextError::InvalidModel)?;
            validate_capacity(*capacity)?;
        }
    }
    Ok(settings)
}

fn write(path: &Path, settings: &ModelContextSettings) -> Result<()> {
    let value = serde_json::to_value(settings).map_err(|_| ContextError::Storage)?;
    crate::storage::write_json_atomic(path, &value).map_err(|_| ContextError::Storage)
}

fn access<R: Runtime, T>(
    app: &AppHandle<R>,
    operation: impl FnOnce(&Path, ModelContextSettings) -> Result<T>,
) -> Result<T> {
    let root = app
        .path()
        .app_data_dir()
        .map_err(|_| ContextError::Storage)?;
    let _guard = STORAGE.lock().map_err(|_| ContextError::Storage)?;
    fs::create_dir_all(&root).map_err(|_| ContextError::Storage)?;
    let path = root.join(FILE_NAME);
    operation(&path, read(&path)?)
}

fn catalog_capacities(catalog: &Value) -> Capacities {
    catalog["models"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|entry| {
            let name = entry["slug"].as_str().or_else(|| entry["id"].as_str())?;
            super::model_settings::validate_model(name).ok()?;
            let capacity = entry["context_window"]
                .as_u64()
                .or_else(|| entry["max_context_window"].as_u64())?;
            validate_capacity(capacity).ok()?;
            Some((name.to_owned(), capacity))
        })
        .take(MAX_MODELS)
        .collect()
}

fn apply_catalog(catalog: &mut Value, overrides: &Capacities) {
    for entry in catalog["models"].as_array_mut().into_iter().flatten() {
        let capacity = entry["slug"]
            .as_str()
            .or_else(|| entry["id"].as_str())
            .and_then(|model| overrides.get(model))
            .copied();
        if let Some(capacity) = capacity {
            entry["context_window"] = capacity.into();
        }
    }
}

/// Called only by the proxy worker, before publishing a GUI model catalog.
pub(crate) fn prepare_catalog<R: Runtime>(
    app: &AppHandle<R>,
    catalog: &mut Value,
    official: bool,
) -> Result<()> {
    access(app, |path, mut settings| {
        if official {
            settings.defaults = catalog_capacities(catalog);
            write(path, &settings)?;
        }
        apply_catalog(catalog, &settings.overrides);
        Ok(())
    })
}

fn model_capacity(settings: &ModelContextSettings, model: &str, official: bool) -> Option<u64> {
    settings.overrides.get(model).copied().or_else(|| {
        official
            .then(|| settings.defaults.get(model).copied())
            .flatten()
    })
}

/// Resolve defaults on a blocking worker; never fetch a model catalog during turn polling.
pub(super) async fn capacity(app: AppHandle, model: String) -> Result<Option<u64>> {
    tauri::async_runtime::spawn_blocking(move || {
        let selection = super::account_selection::read(&app).map_err(|_| ContextError::Storage)?;
        let official = matches!(
            selection,
            super::account_selection::GuiAccountSelection::Account(_)
        );
        let configured = access(&app, |_, settings| {
            Ok(model_capacity(&settings, &model, official))
        })?;
        if configured.is_some() {
            return Ok(configured);
        }
        match selection {
            super::account_selection::GuiAccountSelection::Provider(id) => {
                provider_capacity(&app, &id, &model)
            }
            super::account_selection::GuiAccountSelection::Aggregate(id) => {
                let paths =
                    crate::storage::resolve_paths(&app).map_err(|_| ContextError::Storage)?;
                let config = crate::aggregate_api::read_config(&paths, &id)
                    .map_err(|_| ContextError::Storage)?;
                let profiles = crate::aggregate_api::member_profiles(&paths, &config)
                    .map_err(|_| ContextError::Storage)?;
                let provider = crate::aggregate_api::logical_profile(&config, &profiles)
                    .map_err(|_| ContextError::Storage)?;
                Ok(provider.model_context_windows.get(&model).copied())
            }
            _ => Ok(None),
        }
    })
    .await
    .map_err(|_| ContextError::Storage)?
}

fn provider_capacity(app: &AppHandle, id: &str, model: &str) -> Result<Option<u64>> {
    let paths = crate::storage::resolve_paths(app).map_err(|_| ContextError::Storage)?;
    let provider =
        crate::providers::read_provider(&paths, id).map_err(|_| ContextError::Storage)?;
    if crate::providers::uses_upstream_official_models(&provider) {
        return access(app, |_, settings| Ok(settings.defaults.get(model).copied()));
    }
    let catalog = crate::providers::model_catalog_for_provider_with_image_route(&provider, false);
    Ok(catalog_capacities(&catalog).get(model).copied())
}

#[tauri::command]
pub(crate) async fn codex_gui_model_context_settings(
    app: AppHandle,
) -> std::result::Result<ModelContextSnapshot, String> {
    tauri::async_runtime::spawn_blocking(move || {
        // Network I/O occurs outside the storage guard, so saving and proxy requests remain responsive.
        let catalog = crate::local_proxy::admin_model_catalog(&app);
        access(&app, |path, mut settings| {
            if let Ok(catalog) = &catalog {
                settings.defaults = catalog_capacities(catalog);
                write(path, &settings)?;
            }
            Ok(ModelContextSnapshot {
                settings,
                using_cached_defaults: catalog.is_err(),
            })
        })
    })
    .await
    .map_err(|_| ContextError::Storage.to_string())?
    .map_err(|error| error.to_string())
}

#[tauri::command]
pub(crate) async fn codex_gui_set_model_context(
    app: AppHandle,
    model: String,
    capacity: Option<u64>,
) -> std::result::Result<ModelContextSettings, String> {
    tauri::async_runtime::spawn_blocking(move || {
        super::model_settings::validate_model(&model).map_err(|_| ContextError::InvalidModel)?;
        if let Some(capacity) = capacity {
            validate_capacity(capacity)?;
        }
        access(&app, |path, mut settings| {
            update_model(&mut settings, model, capacity)?;
            write(path, &settings)?;
            Ok(settings)
        })
    })
    .await
    .map_err(|_| ContextError::Storage.to_string())?
    .map_err(|error| error.to_string())
}

fn update_model(
    settings: &mut ModelContextSettings,
    model: String,
    capacity: Option<u64>,
) -> Result<()> {
    if let Some(capacity) = capacity {
        if !settings.overrides.contains_key(&model) && settings.overrides.len() >= MAX_MODELS {
            return Err(ContextError::InvalidModel);
        }
        settings.overrides.insert(model, capacity);
    } else {
        settings.overrides.remove(&model);
    }
    Ok(())
}

#[cfg(test)]
#[path = "model_context_tests.rs"]
mod tests;
