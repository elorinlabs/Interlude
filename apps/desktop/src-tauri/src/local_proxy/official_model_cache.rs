//! Shared official-first discovery with Admin fallback for proxy clients, the GUI, and refreshes.
use super::{UpstreamBody, UpstreamPayload};
use std::{collections::HashSet, io::Read, time::Duration};

use super::request_error::{self, Problem, RequestError, Stage};
use reqwest::{blocking::Client, Url};
use serde_json::{json, Value};
use tauri::{AppHandle, Runtime};

const CACHE_TIMEOUT: Duration = Duration::from_secs(60);

#[derive(Debug, thiserror::Error)]
enum CatalogError {
    #[error("Could not read model catalog server settings")]
    Settings,
    #[error("Invalid model catalog server address")]
    Address,
    #[error("Model catalog cache request failed")]
    Request(#[from] reqwest::Error),
    #[error("Could not read model catalog cache")]
    Read(#[from] std::io::Error),
    #[error("Model catalog returned HTTP {0}")]
    Status(u16),
    #[error("Model catalog cache is invalid or empty")]
    Invalid,
    #[error(transparent)]
    Detailed(RequestError),
}

impl CatalogError {
    fn detail(&self) -> RequestError {
        match self {
            Self::Settings => RequestError::new(Stage::Catalog, Problem::CatalogSettings),
            Self::Address => RequestError::new(Stage::Catalog, Problem::CatalogAddress),
            Self::Invalid => RequestError::new(Stage::Catalog, Problem::CatalogInvalid),
            Self::Status(status) => RequestError::http(Stage::Catalog, *status),
            Self::Read(error) => RequestError::io(Stage::Catalog, error),
            Self::Detailed(error) => *error,
            Self::Request(error) => match error.status() {
                Some(status) => RequestError::http(Stage::Catalog, status.as_u16()),
                None => RequestError::transport(
                    Stage::Catalog,
                    &super::diagnostic_error_causes(error).join(": "),
                ),
            },
        }
    }
}

pub(super) fn with_fallback<R: Runtime>(
    app: &AppHandle<R>,
    official: impl FnOnce() -> Result<UpstreamPayload, String>,
) -> Result<UpstreamPayload, String> {
    let settings = crate::storage::read_app_settings(app)?;
    let _transport_scope = super::transport_settings::RequestScope::enter(settings.proxy_transport);
    prefer_official(official, || fetch(app))
}

/// Fetch Admin suggestions and defaults independently of official model discovery.
pub(crate) fn admin_model_catalog<R: Runtime>(app: &AppHandle<R>) -> Result<Value, String> {
    let payload = fetch(app).map_err(|error| error.to_string())?;
    let UpstreamBody::Buffered(bytes) = payload.body else {
        return Err("Model catalog is unavailable".to_owned());
    };
    serde_json::from_slice(&bytes).map_err(|error| error.to_string())
}

fn prefer_official(
    official: impl FnOnce() -> Result<UpstreamPayload, String>,
    admin: impl FnOnce() -> Result<UpstreamPayload, CatalogError>,
) -> Result<UpstreamPayload, String> {
    let official = {
        let _deadline = super::model_catalog_deadline::Scope::enter();
        official().and_then(|payload| {
            validate_official_payload(payload).map_err(|error| error.detail().wire())
        })
    };
    match official {
        Ok(payload) => Ok(payload),
        Err(error) => fallback_to_admin(&error, admin),
    }
}

fn fallback_to_admin(
    official_error: &str,
    admin: impl FnOnce() -> Result<UpstreamPayload, CatalogError>,
) -> Result<UpstreamPayload, String> {
    let error = RequestError::decode(official_error)
        .map(|error| error.to_string())
        .unwrap_or_else(|| crate::error_logs::sanitize_diagnostic_message(official_error));
    super::diagnostic_event(
        json!({ "event": "model_catalog_admin_fallback_started", "officialError": error }),
    );
    eprintln!("Official model catalog failed: {error}; fetching models from Admin");
    match admin() {
        Ok(payload) => {
            super::diagnostic_event(json!({
                "event": "model_catalog_admin_fallback_succeeded", "status": payload.status
            }));
            Ok(payload)
        }
        Err(error) => {
            super::diagnostic_event(json!({
                "event": "model_catalog_admin_fallback_failed",
                "error": crate::error_logs::sanitize_diagnostic_message(&error.to_string()),
                "causes": super::diagnostic_error_causes(&error)
            }));
            eprintln!("Admin model catalog fallback failed: {error}");
            // Both sources failed. Returning only the official error hides the failed fallback.
            let official = RequestError::decode(official_error)
                .unwrap_or_else(|| RequestError::transport(Stage::Catalog, official_error));
            Err(request_error::catalog_failure(official, error.detail()))
        }
    }
}

fn validate_official_payload(
    mut payload: UpstreamPayload,
) -> Result<UpstreamPayload, CatalogError> {
    if !(200..300).contains(&payload.status) {
        return Err(CatalogError::Status(payload.status));
    }
    let bytes = match payload.body {
        UpstreamBody::Buffered(bytes) => {
            validate_catalog(&bytes)?;
            bytes
        }
        UpstreamBody::Streaming(reader) => read_catalog(reader)?,
    };
    payload.body = UpstreamBody::Buffered(bytes);
    Ok(payload)
}

fn fetch<R: Runtime>(app: &AppHandle<R>) -> Result<UpstreamPayload, CatalogError> {
    let settings = crate::storage::read_app_settings(app).map_err(|_| CatalogError::Settings)?;
    let base = settings
        .cloud_base_url
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or(crate::models::DEFAULT_CLOUD_BASE_URL);
    let client = crate::system_proxy::apply(Client::builder())
        .timeout(CACHE_TIMEOUT)
        .connect_timeout(super::UPSTREAM_CONNECT_TIMEOUT)
        .redirect(super::transport_settings::redirect_policy(
            settings.proxy_transport.max_redirects,
        ))
        .build()?;
    request_catalog(&client, catalog_url(base)?)
}

fn catalog_url(base: &str) -> Result<Url, CatalogError> {
    let mut url = Url::parse(base.trim()).map_err(|_| CatalogError::Address)?;
    if !matches!(url.scheme(), "http" | "https")
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err(CatalogError::Address);
    }
    url.set_path(&format!(
        "{}/official-models",
        url.path().trim_end_matches('/')
    ));
    Ok(url)
}

fn request_catalog(client: &Client, url: Url) -> Result<UpstreamPayload, CatalogError> {
    // Catalogs are public metadata; never send local account or cloud credentials here.
    let response = client
        .get(url)
        .timeout(CACHE_TIMEOUT)
        .header("Accept", "application/json")
        .header("Cache-Control", "no-cache")
        .send()?
        .error_for_status()?;
    let headers = ["etag", "x-models-etag"]
        .into_iter()
        .filter_map(|name| {
            let value = response.headers().get(name)?.to_str().ok()?;
            Some((name.to_owned(), value.to_owned()))
        })
        .collect();
    let bytes = read_catalog(response)?;
    Ok(UpstreamPayload {
        status: 200,
        content_type: Some("application/json".into()),
        response_headers: headers,
        body: UpstreamBody::Buffered(bytes),
        token_usage_service_tier: None,
        token_usage_account: None,
    })
}

fn read_catalog(mut reader: impl Read) -> Result<Vec<u8>, CatalogError> {
    let mut bytes = Vec::new();
    reader.read_to_end(&mut bytes)?;
    validate_catalog(&bytes)?;
    Ok(bytes)
}

fn validate_catalog(bytes: &[u8]) -> Result<(), CatalogError> {
    let value: Value = serde_json::from_slice(bytes)
        .map_err(|error| CatalogError::Detailed(RequestError::json(Stage::Catalog, &error)))?;
    let models = value
        .get("models")
        .and_then(Value::as_array)
        .ok_or(CatalogError::Invalid)?;
    let mut names = HashSet::new();
    let mut visible = false;
    if models.is_empty() {
        return Err(CatalogError::Invalid);
    }
    for model in models {
        let name = model
            .get("slug")
            .or_else(|| model.get("id"))
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|name| !name.is_empty())
            .ok_or(CatalogError::Invalid)?;
        if !names.insert(name) {
            return Err(CatalogError::Invalid);
        }
        visible |= model.get("visibility").and_then(Value::as_str) != Some("hide");
    }
    if !visible {
        return Err(CatalogError::Invalid);
    }
    Ok(())
}

#[cfg(test)]
mod tests;
