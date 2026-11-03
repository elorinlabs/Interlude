use crate::models::{ProviderApiFormat, ProviderRequestOptions};
use reqwest::blocking::RequestBuilder;
use reqwest::header::{HeaderMap, HeaderName, HeaderValue, ACCEPT};
use url::Url;

/// Resolve a model-list endpoint without sending a discovery request to a generation URL.
pub(crate) fn models_url(
    base: &str,
    format: ProviderApiFormat,
    options: Option<&ProviderRequestOptions>,
) -> Result<Url, String> {
    crate::providers::ensure_not_local_proxy_base_url(base)?;
    let mut url = Url::parse(base.trim()).map_err(|_| "Invalid service address")?;
    if !matches!(url.scheme(), "http" | "https")
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.fragment().is_some()
    {
        return Err(
            "Enter an HTTP or HTTPS service address without login details or a fragment".into(),
        );
    }
    if let Some(options) = options {
        options.validate().map_err(|e| e.to_string())?;
    }
    let path = url.path().trim_end_matches('/');
    let root = if options.is_some_and(|options| options.use_full_url) {
        generation_root(path, format)
            .ok_or("Model discovery is unavailable for this full address")?
    } else {
        path
    };
    let root = if root.is_empty() {
        if format == ProviderApiFormat::GeminiGenerateContent {
            "/v1beta"
        } else {
            "/v1"
        }
    } else {
        root
    };
    if format == ProviderApiFormat::GeminiGenerateContent {
        let root = if url.host_str() == Some("generativelanguage.googleapis.com") {
            root.strip_suffix("/openai").unwrap_or(root)
        } else {
            root
        };
        let pairs = url
            .query_pairs()
            .filter(|(key, _)| key != "alt")
            .map(|(k, v)| (k.into_owned(), v.into_owned()))
            .collect::<Vec<_>>();
        // Streaming response selection does not apply to the model-list endpoint.
        let path = if root.ends_with("/models") {
            root.to_owned()
        } else {
            format!("{root}/models")
        };
        url.set_path(&path);
        url.set_query(None);
        if !pairs.is_empty() {
            url.query_pairs_mut().extend_pairs(pairs);
        }
        return Ok(url);
    }
    let path = if root.ends_with("/models") {
        root.to_owned()
    } else {
        format!("{root}/models")
    };
    url.set_path(&path);
    Ok(url)
}

fn generation_root(path: &str, format: ProviderApiFormat) -> Option<&str> {
    match format {
        ProviderApiFormat::OpenaiResponses => path.strip_suffix("/responses"),
        ProviderApiFormat::OpenaiChat => path.strip_suffix("/chat/completions"),
        ProviderApiFormat::AnthropicMessages => path.strip_suffix("/messages"),
        ProviderApiFormat::GeminiGenerateContent => {
            let (root, operation) = path.rsplit_once("/models/")?;
            (operation.ends_with(":generateContent")
                || operation.ends_with(":streamGenerateContent"))
            .then_some(root)
        }
    }
}

pub(crate) fn apply_headers(
    mut request: RequestBuilder,
    api_key: &str,
    format: ProviderApiFormat,
    options: Option<&ProviderRequestOptions>,
) -> Result<RequestBuilder, String> {
    let mut headers = HeaderMap::new();
    headers.insert(ACCEPT, HeaderValue::from_static("application/json"));
    if let Some(options) = options {
        options.validate().map_err(|e| e.to_string())?;
        for (name, value) in &options.headers {
            let name = HeaderName::from_bytes(name.as_bytes())
                .map_err(|_| "Invalid request header name")?;
            let value = HeaderValue::from_str(value).map_err(|_| "Invalid request header value")?;
            headers.insert(name, value);
        }
    }
    request = request.headers(headers);
    let key = api_key.trim();
    match format {
        ProviderApiFormat::AnthropicMessages => {
            if !options.is_some_and(|o| {
                o.headers
                    .keys()
                    .any(|k| k.eq_ignore_ascii_case("anthropic-version"))
            }) {
                request = request.header("anthropic-version", "2023-06-01");
            }
            if !key.is_empty() {
                request = request.header("x-api-key", key);
            }
        }
        ProviderApiFormat::GeminiGenerateContent => {
            if !key.is_empty() {
                request = request.header("x-goog-api-key", key);
            }
        }
        _ if !key.is_empty() => request = request.bearer_auth(key),
        _ => {}
    }
    Ok(request)
}

pub(crate) fn same_endpoint(saved: &str, requested: &str) -> bool {
    let (Ok(mut left), Ok(mut right)) = (Url::parse(saved.trim()), Url::parse(requested.trim()))
    else {
        return false;
    };
    left.set_path(left.path().trim_end_matches('/').to_owned().as_str());
    right.set_path(right.path().trim_end_matches('/').to_owned().as_str());
    left == right
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn discovery_preserves_query_and_derives_only_known_full_routes() {
        let options = ProviderRequestOptions {
            use_full_url: true,
            ..Default::default()
        };
        let url = models_url(
            "https://api.example/v1/messages?tenant=east",
            ProviderApiFormat::AnthropicMessages,
            Some(&options),
        )
        .unwrap();
        assert_eq!(url.as_str(), "https://api.example/v1/models?tenant=east");
        assert!(models_url(
            "https://api.example/custom",
            ProviderApiFormat::OpenaiChat,
            Some(&options)
        )
        .is_err());
        assert!(!same_endpoint(
            "https://api.example/v1?tenant=a",
            "https://api.example/v1?tenant=b"
        ));
    }

    #[test]
    fn native_discovery_matches_generation_for_legacy_official_addresses() {
        let base = "https://generativelanguage.googleapis.com/v1beta/openai";
        assert_eq!(
            models_url(base, ProviderApiFormat::GeminiGenerateContent, None)
                .unwrap()
                .path(),
            "/v1beta/models"
        );
        assert_eq!(
            models_url(base, ProviderApiFormat::OpenaiChat, None)
                .unwrap()
                .path(),
            "/v1beta/openai/models"
        );
    }

    #[test]
    fn protocol_authentication_and_custom_headers_are_shared() {
        let client = reqwest::blocking::Client::new();
        let options = ProviderRequestOptions {
            headers: [("x-region".into(), "east".into())].into(),
            ..Default::default()
        };
        for (format, header) in [
            (ProviderApiFormat::AnthropicMessages, "x-api-key"),
            (ProviderApiFormat::GeminiGenerateContent, "x-goog-api-key"),
        ] {
            let request = apply_headers(
                client.get("https://api.example/models"),
                "secret",
                format,
                Some(&options),
            )
            .unwrap()
            .build()
            .unwrap();
            assert_eq!(request.headers()[header], "secret");
            assert_eq!(request.headers()["x-region"], "east");
            assert!(!request.headers().contains_key("authorization"));
        }
    }
}
