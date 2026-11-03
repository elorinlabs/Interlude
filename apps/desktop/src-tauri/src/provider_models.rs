use std::time::Duration;

use reqwest::blocking::Client;
use serde_json::Value;
use tauri::Runtime;
use url::Url;

use crate::{
    models::{ProviderApiFormat, ProviderProfile, ProviderRequestOptions},
    providers::read_provider,
    storage::resolve_paths,
};

#[path = "provider_model_pages.rs"]
mod pages;
const MODEL_QUERY_TIMEOUT: Duration = Duration::from_secs(15);

#[derive(Debug, Default, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ModelDiscoveryOptions {
    pub(crate) api_format: Option<ProviderApiFormat>,
    pub(crate) request_options: Option<ProviderRequestOptions>,
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ModelDiscoveryRequest {
    pub(crate) base_url: String,
    pub(crate) api_key: String,
    pub(crate) provider_id: Option<String>,
    pub(crate) options: Option<ModelDiscoveryOptions>,
}

#[tauri::command]
pub(crate) async fn fetch_relay_models<R: Runtime + 'static>(
    app: tauri::AppHandle<R>,
    request: ModelDiscoveryRequest,
) -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let ModelDiscoveryRequest {
            base_url,
            api_key,
            provider_id,
            options,
        } = request;
        let saved = if let Some(id) = provider_id.as_deref() {
            let paths = resolve_paths(&app).map_err(|_| "Saved provider could not be loaded")?;
            Some(read_provider(&paths, id).map_err(|_| "Saved provider could not be loaded")?)
        } else {
            None
        };
        let reusable = saved
            .as_ref()
            .filter(|p| reusable_api_key(p, &base_url).is_some());
        let options = options.unwrap_or_default();
        let format = options
            .api_format
            .or_else(|| reusable.map(|p| p.api_format))
            .unwrap_or(ProviderApiFormat::OpenaiResponses);
        let settings = options
            .request_options
            .or_else(|| reusable.and_then(|p| p.request_options.clone()));
        let token = if api_key.trim().is_empty() {
            reusable.map(|p| p.api_key.clone()).unwrap_or_default()
        } else {
            api_key.trim().to_owned()
        };
        fetch_models(&base_url, &token, format, settings.as_ref())
    })
    .await
    .map_err(|_| "Could not load models. Please try again".to_string())?
}

fn reusable_api_key(provider: &ProviderProfile, base_url: &str) -> Option<String> {
    let same = crate::provider_discovery::same_endpoint(&provider.base_url, base_url)
        || (provider
            .request_options
            .as_ref()
            .is_none_or(|o| !o.use_full_url)
            && normalized_relay_models_url(&provider.base_url)
                .zip(relay_models_url(base_url).ok())
                .is_some_and(|(a, b)| a == b));
    same.then(|| provider.api_key.trim().to_owned())
}

fn normalized_relay_models_url(base_url: &str) -> Option<Url> {
    let mut url = relay_models_url(base_url).ok()?;
    let path = url.path().strip_suffix("/models")?.trim_end_matches('/');
    let root = if path.to_ascii_lowercase().ends_with("/v1") {
        &path[..path.len() - "/v1".len()]
    } else {
        path
    };
    url.set_path(&format!("{root}/v1/models"));
    Some(url)
}

pub(crate) fn fetch_relay_models_blocking(
    base_url: &str,
    api_key: &str,
) -> Result<Vec<String>, String> {
    fetch_models(base_url, api_key, ProviderApiFormat::OpenaiResponses, None)
}

pub(crate) fn fetch_models(
    base_url: &str,
    api_key: &str,
    format: ProviderApiFormat,
    options: Option<&ProviderRequestOptions>,
) -> Result<Vec<String>, String> {
    let query_url = crate::provider_discovery::models_url(base_url, format, options)?;
    let client = crate::system_proxy::apply(Client::builder())
        .timeout(MODEL_QUERY_TIMEOUT)
        .redirect(reqwest::redirect::Policy::none())
        .user_agent("Codex-Switch")
        .build()
        .map_err(|error| format!("Failed to create relay model query client: {error}"))?;
    pages::fetch(
        &client,
        pages::Query {
            url: query_url,
            api_key,
            format,
            options,
        },
    )
}

fn relay_models_url(base_url: &str) -> Result<Url, String> {
    crate::provider_discovery::models_url(base_url, ProviderApiFormat::OpenaiResponses, None)
}

fn parse_model_page(payload: &Value) -> Result<Vec<String>, String> {
    let data = payload
        .get("data")
        .or_else(|| payload.get("models"))
        .and_then(Value::as_array)
        .ok_or_else(|| "Relay model response is missing data".to_string())?;
    let mut models = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for item in data {
        if item
            .get("supportedGenerationMethods")
            .and_then(Value::as_array)
            .is_some_and(|methods| {
                !methods
                    .iter()
                    .any(|method| method.as_str() == Some("generateContent"))
            })
        {
            continue;
        }
        let Some(model) = item
            .get("id")
            .or_else(|| item.get("name"))
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|model| !model.is_empty())
        else {
            continue;
        };
        let model = model.strip_prefix("models/").unwrap_or(model);
        if !model.is_empty() && seen.insert(model.to_string()) {
            models.push(model.to_string());
        }
    }
    Ok(models)
}

#[cfg(test)]
fn parse_models(payload: &Value) -> Result<Vec<String>, String> {
    let models = parse_model_page(payload)?;
    if models.is_empty() {
        Err("Relay did not return any available models".to_string())
    } else {
        Ok(models)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use tiny_http::{Header, Response, Server};

    fn saved_provider() -> ProviderProfile {
        serde_json::from_value(json!({
            "id": "relay-test", "name": "Relay", "baseUrl": "https://relay.example.com/api/v1/",
            "apiKey": "sk-saved-test", "model": "gpt-6-astra", "apiFormat": "openaiResponses"
        }))
        .unwrap()
    }

    #[test]
    fn reuses_saved_credentials_only_for_the_same_relay_endpoint() {
        let mut provider = saved_provider();
        assert_eq!(
            reusable_api_key(&provider, "https://relay.example.com/api/v1").as_deref(),
            Some("sk-saved-test")
        );
        for url in [
            "https://other.example.com/api/v1",
            "http://relay.example.com/api/v1",
            "https://relay.example.com:444/api/v1",
            "https://relay.example.com/other/v1",
            "https://relay.example.com/api",
        ] {
            assert!(reusable_api_key(&provider, url).is_none());
        }
        provider.base_url = "https://relay.example.com/api".to_string();
        assert_eq!(
            reusable_api_key(&provider, "https://relay.example.com/api/v1").as_deref(),
            Some("sk-saved-test")
        );
        provider.api_key.clear();
        assert_eq!(
            reusable_api_key(&provider, &provider.base_url),
            Some(String::new())
        );
    }

    #[test]
    fn builds_models_url_from_openai_compatible_base_url() {
        let url = relay_models_url("https://relay.example.com/api/v1/?ignored=yes").unwrap();
        assert_eq!(
            url.as_str(),
            "https://relay.example.com/api/v1/models?ignored=yes"
        );
    }

    #[test]
    fn parses_and_deduplicates_openai_model_lists() {
        let models = parse_models(&json!({
            "object": "list",
            "data": [
                { "id": "gpt-5.6-sol", "object": "model" },
                { "id": "claude-sonnet-4-5", "type": "model" },
                { "id": "gpt-5.6-sol", "object": "model" }
            ]
        }))
        .unwrap();

        assert_eq!(models, vec!["gpt-5.6-sol", "claude-sonnet-4-5"]);
    }

    #[test]
    fn native_discovery_filters_embedding_models_and_strips_resource_prefix() {
        assert_eq!(
            parse_models(&json!({"models":[
                {"name":"models/generative","supportedGenerationMethods":["generateContent"]},
                {"name":"models/embedding","supportedGenerationMethods":["embedContent"]}
            ]}))
            .unwrap(),
            vec!["generative"]
        );
    }

    #[test]
    fn discovers_with_custom_headers_query_and_native_auth() {
        let server = Server::http("127.0.0.1:0").unwrap();
        let endpoint = format!("http://{}/v1/messages?tenant=east", server.server_addr());
        let worker = std::thread::spawn(move || {
            let request = server.recv().unwrap();
            assert_eq!(request.url(), "/v1/models?tenant=east");
            for (name, value) in [
                ("x-api-key", "test"),
                ("x-region", "west"),
                ("anthropic-version", "2023-06-01"),
            ] {
                assert!(request
                    .headers()
                    .iter()
                    .any(|h| h.field.equiv(name) && h.value.as_str() == value));
            }
            request
                .respond(Response::from_string(r#"{"data":[{"id":"native"}]}"#))
                .unwrap();
        });
        let options = ProviderRequestOptions {
            use_full_url: true,
            headers: [("x-region".into(), "west".into())].into(),
            ..Default::default()
        };
        assert_eq!(
            fetch_models(
                &endpoint,
                "test",
                ProviderApiFormat::AnthropicMessages,
                Some(&options)
            )
            .unwrap(),
            vec!["native"]
        );
        worker.join().unwrap();
    }

    #[test]
    fn fetches_models_with_bearer_authentication() {
        let server = Server::http("127.0.0.1:0").unwrap();
        let base_url = format!("http://{}/v1", server.server_addr());
        let worker = std::thread::spawn(move || {
            let request = server.recv().unwrap();
            assert_eq!(request.url(), "/v1/models");
            assert!(request.headers().iter().any(|header| {
                header.field.equiv("Authorization")
                    && header.value.as_str() == "Bearer sk-relay-test"
            }));
            request
                .respond(
                    Response::from_string(r#"{"object":"list","data":[{"id":"gpt-test"}]}"#)
                        .with_header(
                            Header::from_bytes("Content-Type", "application/json").unwrap(),
                        ),
                )
                .unwrap();
        });

        let models = fetch_relay_models_blocking(&base_url, "sk-relay-test").unwrap();

        assert_eq!(models, vec!["gpt-test"]);
        worker.join().unwrap();
    }
}
