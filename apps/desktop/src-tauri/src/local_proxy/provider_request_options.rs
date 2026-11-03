use reqwest::blocking::RequestBuilder;
use reqwest::header::{HeaderMap, HeaderName, HeaderValue};
use serde_json::Value;

use crate::models::ProviderProfile;

pub(super) fn url(provider: &ProviderProfile, endpoint: &str) -> String {
    if uses_full_url(provider) {
        provider.base_url.clone()
    } else {
        super::build_upstream_url(&provider.base_url, endpoint)
    }
}

pub(super) fn uses_full_url(provider: &ProviderProfile) -> bool {
    provider
        .request_options
        .as_ref()
        .is_some_and(|options| options.use_full_url)
}

pub(super) fn headers(request: RequestBuilder, provider: &ProviderProfile) -> RequestBuilder {
    let Some(options) = &provider.request_options else {
        return request;
    };
    configured_headers(request, options)
}

fn configured_headers(
    request: RequestBuilder,
    options: &crate::models::ProviderRequestOptions,
) -> RequestBuilder {
    let mut headers = HeaderMap::new();
    for (name, value) in &options.headers {
        let (Ok(header_name), Ok(header_value)) = (
            HeaderName::from_bytes(name.as_bytes()),
            HeaderValue::from_str(value),
        ) else {
            // Preserve reqwest's validation failure if a stored profile contains an invalid header.
            return request.header(name.as_str(), value.as_str());
        };
        headers.insert(header_name, header_value);
    }
    // RequestBuilder::header appends; a map replaces every existing value for each configured name.
    request.headers(headers)
}

/// Apply after protocol conversion; only optional parameters may be overridden.
pub(super) fn body(body: &mut Value, provider: &ProviderProfile) {
    let Some(options) = &provider.request_options else {
        return;
    };
    let client_tool_limit = body["max_tool_calls"].as_u64();
    if let Some(target) = body.as_object_mut() {
        for (key, value) in &options.body {
            merge(target.entry(key.clone()).or_insert(Value::Null), value);
        }
    }
    preserve_tool_limit(body, client_tool_limit);
}

fn preserve_tool_limit(body: &mut Value, client_limit: Option<u64>) {
    if let Some(limit) = client_limit {
        let configured = body["max_tool_calls"].as_u64().unwrap_or(limit);
        body["max_tool_calls"] = Value::from(limit.min(configured));
    }
}

fn merge(target: &mut Value, patch: &Value) {
    if let (Some(target), Some(patch)) = (target.as_object_mut(), patch.as_object()) {
        for (key, value) in patch {
            merge(target.entry(key.clone()).or_insert(Value::Null), value);
        }
    } else {
        *target = patch.clone();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn provider_overrides_cannot_relax_the_clients_search_budget() {
        for configured in [json!(10), Value::Null, json!("unlimited")] {
            let mut body = json!({"max_tool_calls": configured});
            preserve_tool_limit(&mut body, Some(3));
            assert_eq!(body["max_tool_calls"], 3);
        }
        let mut body = json!({"max_tool_calls": 1});
        preserve_tool_limit(&mut body, Some(3));
        assert_eq!(body["max_tool_calls"], 1);
    }

    #[test]
    fn nested_parameters_preserve_unmodified_defaults() {
        let mut body = json!({"thinking": {"type": "enabled", "budget_tokens": 1024}});
        merge(
            &mut body,
            &json!({"thinking": {"budget_tokens": 4096}, "temperature": 0.2}),
        );
        assert_eq!(
            body,
            json!({"thinking": {"type": "enabled", "budget_tokens": 4096}, "temperature": 0.2})
        );
    }

    #[test]
    fn custom_headers_replace_existing_values_without_removing_other_headers() {
        let request = reqwest::blocking::Client::new()
            .get("https://upstream.example/v1")
            .header("User-Agent", "client-agent")
            .header("user-agent", "forwarded-agent")
            .header("X-Trace", "trace");
        let options = crate::models::ProviderRequestOptions {
            headers: [("USER-AGENT".to_string(), "custom-agent".to_string())].into(),
            ..Default::default()
        };
        let request = configured_headers(request, &options).build().unwrap();
        assert_eq!(request.headers().get_all("user-agent").iter().count(), 1);
        assert_eq!(request.headers()["user-agent"], "custom-agent");
        assert_eq!(request.headers()["x-trace"], "trace");
    }
}
