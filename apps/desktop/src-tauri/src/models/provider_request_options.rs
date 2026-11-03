use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

const MAX_HEADERS: usize = 32;
const MAX_HEADER_VALUE_BYTES: usize = 4096;
const MAX_OPTIONS_BYTES: usize = 16 * 1024;
const MAX_BODY_DEPTH: usize = 8;

/// Optional upstream settings, separate from client credentials and conversation data.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct ProviderRequestOptions {
    #[serde(default)]
    pub(crate) use_full_url: bool,
    #[serde(default)]
    pub(crate) headers: BTreeMap<String, String>,
    #[serde(default)]
    pub(crate) body: Map<String, Value>,
}

#[derive(Debug, thiserror::Error)]
pub(crate) enum ProviderRequestOptionsError {
    #[error("Advanced settings are too large")]
    TooLarge,
    #[error("A custom header is invalid or reserved")]
    InvalidHeader,
    #[error("Additional parameters cannot replace conversation or authentication fields")]
    ReservedParameter,
    #[error("Additional parameters are nested too deeply")]
    TooDeep,
}

impl ProviderRequestOptions {
    pub(crate) fn validate(&self) -> Result<(), ProviderRequestOptionsError> {
        let bytes = serde_json::to_vec(self).map_err(|_| ProviderRequestOptionsError::TooLarge)?;
        if self.headers.len() > MAX_HEADERS || bytes.len() > MAX_OPTIONS_BYTES {
            return Err(ProviderRequestOptionsError::TooLarge);
        }
        let mut names = std::collections::HashSet::new();
        for (name, value) in &self.headers {
            if protected_header(name)
                || !names.insert(name.to_ascii_lowercase())
                || reqwest::header::HeaderName::from_bytes(name.as_bytes()).is_err()
                || reqwest::header::HeaderValue::from_str(value).is_err()
                || value.len() > MAX_HEADER_VALUE_BYTES
            {
                return Err(ProviderRequestOptionsError::InvalidHeader);
            }
        }
        if self.body.values().any(|value| exceeds_depth(value, 1)) {
            return Err(ProviderRequestOptionsError::TooDeep);
        }
        if self
            .body
            .keys()
            .any(|key| protected_parameter(key) || prototype_key(key))
            || self.body.values().any(contains_prototype_key)
        {
            return Err(ProviderRequestOptionsError::ReservedParameter);
        }
        Ok(())
    }
}

fn protected_header(name: &str) -> bool {
    let name = name.to_ascii_lowercase();
    prototype_key(&name)
        || name.starts_with("x-forwarded-")
        || name.starts_with("x-codex-")
        || matches!(
            name.as_str(),
            "authorization"
                | "proxy-authorization"
                | "x-api-key"
                | "api-key"
                | "x-goog-api-key"
                | "cookie"
                | "set-cookie"
                | "host"
                | "connection"
                | "content-length"
                | "content-type"
                | "transfer-encoding"
                | "upgrade"
                | "te"
                | "trailer"
                | "keep-alive"
                | "proxy-connection"
                | "forwarded"
                | "chatgpt-account-id"
        )
}

fn prototype_key(name: &str) -> bool {
    matches!(name, "__proto__" | "constructor" | "prototype")
}

fn contains_prototype_key(value: &Value) -> bool {
    match value {
        Value::Object(values) => values
            .iter()
            .any(|(key, child)| prototype_key(key) || contains_prototype_key(child)),
        Value::Array(values) => values.iter().any(contains_prototype_key),
        _ => false,
    }
}

fn protected_parameter(name: &str) -> bool {
    matches!(
        name,
        "model"
            | "stream"
            | "stream_options"
            | "input"
            | "messages"
            | "tools"
            | "tool_choice"
            | "system"
            | "instructions"
            | "previous_response_id"
            | "conversation"
            | "contents"
            | "systemInstruction"
            | "system_instruction"
            | "cachedContent"
            | "cached_content"
            | "toolConfig"
            | "tool_config"
            | "include"
            | "api_key"
            | "apiKey"
            | "authorization"
    )
}

fn exceeds_depth(value: &Value, depth: usize) -> bool {
    if depth > MAX_BODY_DEPTH {
        return true;
    }
    match value {
        Value::Object(values) => values.values().any(|child| exceeds_depth(child, depth + 1)),
        Value::Array(values) => values.iter().any(|child| exceeds_depth(child, depth + 1)),
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn accepts_optional_parameters_and_rejects_protocol_overrides() {
        let valid: ProviderRequestOptions = serde_json::from_value(json!({
            "headers": {"User-Agent": "My Client", "X-Region": "east"},
            "body": {"temperature": 0.3, "thinking": {"type": "enabled"}}
        }))
        .unwrap();
        assert!(valid.validate().is_ok());
        for field in [
            "model",
            "stream",
            "messages",
            "tools",
            "api_key",
            "stream_options",
            "contents",
            "systemInstruction",
            "system_instruction",
            "cachedContent",
            "cached_content",
            "toolConfig",
            "tool_config",
        ] {
            let mut invalid = valid.clone();
            invalid.body.insert(field.into(), json!(false));
            assert!(invalid.validate().is_err(), "{field}");
        }
    }

    #[test]
    fn rejects_authentication_smuggling_duplicate_headers_and_excessive_input() {
        for name in [
            "Authorization",
            "X-API-Key",
            "Host",
            "X-Forwarded-For",
            "Content-Length",
        ] {
            let options = ProviderRequestOptions {
                headers: [(name.to_string(), "value".to_string())].into(),
                ..Default::default()
            };
            assert!(options.validate().is_err(), "{name}");
        }
        let mut options = ProviderRequestOptions::default();
        options
            .headers
            .insert("X-Region".into(), "ok\r\nInjected: value".into());
        assert!(options.validate().is_err());
        options.headers = [
            ("X-Region".into(), "a".into()),
            ("x-region".into(), "b".into()),
        ]
        .into();
        assert!(options.validate().is_err());
        options.headers.clear();
        options
            .body
            .insert("extra".into(), json!("a".repeat(MAX_OPTIONS_BYTES)));
        assert!(options.validate().is_err());
    }

    #[test]
    fn rejects_nested_prototype_fields_and_counts_complete_serialized_settings() {
        for body in [
            json!({"__proto__": {"polluted": true}}),
            json!({"extra": [{"constructor": {"prototype": {"polluted": true}}}]}),
        ] {
            let options: ProviderRequestOptions =
                serde_json::from_value(json!({"body": body})).unwrap();
            assert!(matches!(
                options.validate(),
                Err(ProviderRequestOptionsError::ReservedParameter)
            ));
        }
        let mut options: ProviderRequestOptions =
            serde_json::from_value(json!({"body": {"extra": ""}})).unwrap();
        let overhead = serde_json::to_vec(&options).unwrap().len();
        options.body.insert(
            "extra".into(),
            json!("x".repeat(MAX_OPTIONS_BYTES - overhead)),
        );
        assert!(options.validate().is_ok());
        options.body.insert(
            "extra".into(),
            json!("x".repeat(MAX_OPTIONS_BYTES - overhead + 1)),
        );
        assert!(matches!(
            options.validate(),
            Err(ProviderRequestOptionsError::TooLarge)
        ));
    }
}
