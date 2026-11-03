//! Keep model discovery's client identity aligned with Codex CLI's versioned requests.
use reqwest::{blocking::RequestBuilder, header, Url};
use tiny_http::Method;

pub(super) fn apply_user_agent(
    request: RequestBuilder,
    method: &Method,
    upstream_url: &str,
    forwarded: &[(String, String)],
) -> RequestBuilder {
    if *method != Method::Get {
        return request;
    }
    let Ok(url) = Url::parse(upstream_url) else {
        return request;
    };
    if !matches!(
        url.path(),
        "/models" | "/v1/models" | "/backend-api/codex/models"
    ) {
        return request;
    }
    let user_agent = forwarded
        .iter()
        .find(|(name, value)| name.eq_ignore_ascii_case("user-agent") && !value.trim().is_empty())
        .map(|(_, value)| value.clone())
        .unwrap_or_else(|| format!("codex_cli_rs/{}", client_version(&url)));
    let Ok(value) = header::HeaderValue::from_str(&user_agent) else {
        return request;
    };
    // Replace the fallback and forwarded copies rather than sending duplicate User-Agent headers.
    request.headers(header::HeaderMap::from_iter([(header::USER_AGENT, value)]))
}

fn client_version(url: &Url) -> String {
    url.query_pairs()
        .filter(|(name, _)| name == "client_version")
        .find_map(|(_, value)| semver::Version::parse(&value).ok())
        .map(|version| format!("{}.{}.{}", version.major, version.minor, version.patch))
        .unwrap_or_else(|| crate::official_models::MIN_CODEX_MODEL_CLIENT_VERSION.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request(url: &str, forwarded: &[(String, String)]) -> reqwest::blocking::Request {
        let builder = reqwest::blocking::Client::new()
            .get(url)
            .header(header::USER_AGENT, "codex_cli_rs/0.1.0");
        let builder = super::super::apply_forward_headers(builder, forwarded, true);
        apply_user_agent(builder, &Method::Get, url, forwarded)
            .build()
            .unwrap()
    }

    #[test]
    fn generated_model_requests_use_the_query_version() {
        for version in ["0.170.0", "0.170.0-alpha.2"] {
            let url =
                format!("https://chatgpt.com/backend-api/codex/models?client_version={version}");
            let request = request(&url, &[]);
            assert_eq!(
                request.headers()[header::USER_AGENT],
                "codex_cli_rs/0.170.0"
            );
            assert_eq!(
                request.headers().get_all(header::USER_AGENT).iter().count(),
                1
            );
            assert_eq!(request.url().as_str(), url);
        }
    }

    #[test]
    fn forwarded_cli_identity_is_preserved_without_duplicate_headers() {
        let user_agent = "codex_cli_rs/0.170.0 (Windows 11; x86_64) WindowsTerminal";
        let request = request(
            "https://chatgpt.com/backend-api/codex/models?client_version=0.170.0",
            &[("User-Agent".into(), user_agent.into())],
        );
        assert_eq!(request.headers()[header::USER_AGENT], user_agent);
        assert_eq!(
            request.headers().get_all(header::USER_AGENT).iter().count(),
            1
        );
    }

    #[test]
    fn invalid_query_versions_cannot_become_header_values() {
        let request = request(
            "https://chatgpt.com/backend-api/codex/models?client_version=bad%0D%0Avalue",
            &[],
        );
        assert_eq!(
            request.headers()[header::USER_AGENT],
            format!(
                "codex_cli_rs/{}",
                crate::official_models::MIN_CODEX_MODEL_CLIENT_VERSION
            )
        );
    }

    #[test]
    fn other_endpoints_keep_their_existing_identity() {
        let request = request(
            "https://chatgpt.com/backend-api/codex/usage?client_version=0.170.0",
            &[],
        );
        assert_eq!(request.headers()[header::USER_AGENT], "codex_cli_rs/0.1.0");
    }
}
