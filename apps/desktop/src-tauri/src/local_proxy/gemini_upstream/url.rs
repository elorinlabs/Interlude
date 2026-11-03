use super::BridgeError;
use crate::models::ProviderProfile;
use ::url::Url;

pub(super) fn endpoint(
    provider: &ProviderProfile,
    model: &str,
    stream: bool,
) -> Result<String, BridgeError> {
    let mut url = Url::parse(&provider.base_url).map_err(|_| BridgeError::InvalidEndpoint)?;
    if !matches!(url.scheme(), "https" | "http") || url.host_str().is_none() {
        return Err(BridgeError::InvalidEndpoint);
    }
    if !super::super::provider_request_options::uses_full_url(provider) {
        let model = model.strip_prefix("models/").unwrap_or(model);
        if model.is_empty()
            || !model
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || b"-_ .".contains(&byte))
            || model.contains(' ')
        {
            return Err(BridgeError::InvalidEndpoint);
        }
        let path = url.path().trim_end_matches('/');
        let path = if url.host_str() == Some("generativelanguage.googleapis.com") {
            path.strip_suffix("/openai").unwrap_or(path)
        } else {
            path
        };
        let root = if path.is_empty() { "/v1beta" } else { path };
        let operation = if stream {
            "streamGenerateContent"
        } else {
            "generateContent"
        };
        url.set_path(&format!("{root}/models/{model}:{operation}"));
    }
    if stream {
        let query = url
            .query_pairs()
            .filter(|(key, _)| key != "alt")
            .map(|(key, value)| (key.into_owned(), value.into_owned()))
            .collect::<Vec<_>>();
        url.set_query(None);
        url.query_pairs_mut()
            .extend_pairs(query)
            .append_pair("alt", "sse");
    }
    Ok(url.to_string())
}
