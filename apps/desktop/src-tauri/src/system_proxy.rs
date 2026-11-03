use std::sync::{OnceLock, RwLock};

use reqwest::{blocking::ClientBuilder, Proxy, Url};

use crate::models::NetworkProxySettings;

mod bypass;
mod environment;
mod parsing;
mod platform;

use bypass::{bypass_rule_matches, should_proxy_target};
use parsing::supported_proxy_scheme;

static NETWORK_PROXY: OnceLock<RwLock<Option<Url>>> = OnceLock::new();
const DEFAULT_NETWORK_PROXY_URL: &str = "http://127.0.0.1";

#[derive(Clone, Debug, Default, PartialEq)]
struct SystemProxyConfig {
    default_proxy: Option<Url>,
    http_proxy: Option<Url>,
    https_proxy: Option<Url>,
    socks_proxy: Option<Url>,
    bypass: Vec<String>,
    #[cfg(target_os = "windows")]
    auto_config_url: Option<String>,
    #[cfg(target_os = "windows")]
    auto_detect: bool,
}

#[derive(Clone, Debug, PartialEq)]
enum ProxyDecision {
    Direct,
    Proxy(Url),
}

impl SystemProxyConfig {
    fn proxy_for(&self, target: &Url) -> Option<Url> {
        if self.should_bypass(target) {
            return None;
        }
        #[cfg(target_os = "windows")]
        // Explicit PAC takes precedence over saved manual settings. Do not start WPAD
        // discovery when a manual proxy is available; Windows often leaves it enabled.
        if self.auto_config_url.is_some() || !self.has_manual_proxy() {
            if let Some(decision) = platform::windows_auto_proxy_for(self, target) {
                return match decision {
                    ProxyDecision::Direct => None,
                    ProxyDecision::Proxy(proxy) => Some(proxy),
                };
            }
        }
        self.configured_proxy_for(target)
    }

    fn has_manual_proxy(&self) -> bool {
        self.default_proxy.is_some()
            || self.http_proxy.is_some()
            || self.https_proxy.is_some()
            || self.socks_proxy.is_some()
    }

    fn configured_proxy_for(&self, target: &Url) -> Option<Url> {
        if self.should_bypass(target) {
            return None;
        }

        match target.scheme() {
            "http" => self
                .http_proxy
                .as_ref()
                .or(self.default_proxy.as_ref())
                .or(self.socks_proxy.as_ref())
                .cloned(),
            "https" => self
                .https_proxy
                .as_ref()
                .or(self.default_proxy.as_ref())
                .or(self.socks_proxy.as_ref())
                .cloned(),
            _ => None,
        }
    }

    fn should_bypass(&self, target: &Url) -> bool {
        let Some(host) = target.host_str() else {
            return true;
        };
        let host = host.trim_matches(['[', ']']).to_ascii_lowercase();
        if !should_proxy_target(target) {
            return true;
        }

        self.bypass
            .iter()
            .any(|rule| bypass_rule_matches(rule, &host, target.port_or_known_default()))
    }
}

pub(crate) fn apply(builder: ClientBuilder) -> ClientBuilder {
    builder.no_proxy().proxy(Proxy::custom(proxy_for_target))
}

pub(crate) fn proxy_for_target(target: &Url) -> Option<Url> {
    if !should_proxy_target(target) {
        return None;
    }
    if let Some(proxy_url) = configured_network_proxy() {
        return Some(proxy_url);
    }
    match environment::proxy_for(target) {
        Some(ProxyDecision::Direct) => return None,
        Some(ProxyDecision::Proxy(proxy)) => return Some(proxy),
        None => {}
    }
    platform::current_system_proxy().and_then(|config| config.proxy_for(target))
}

#[derive(Debug, thiserror::Error)]
pub(crate) enum ProxyResolutionError {
    #[error("Reading network proxy settings failed")]
    Task(#[from] tokio::task::JoinError),
    #[error("Reading network proxy settings timed out")]
    Timeout,
}

/// Resolve the complete URL off the async runtime; callers must resolve each redirect separately.
pub(crate) async fn apply_async(
    builder: reqwest::ClientBuilder,
    target: &Url,
) -> Result<reqwest::ClientBuilder, ProxyResolutionError> {
    resolve_async(builder, target.clone(), proxy_for_target).await
}

async fn resolve_async(
    builder: reqwest::ClientBuilder,
    target: Url,
    resolve: impl FnOnce(&Url) -> Option<Url> + Send + 'static,
) -> Result<reqwest::ClientBuilder, ProxyResolutionError> {
    const LOOKUP_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(10);
    let lookup = tokio::task::spawn_blocking(move || resolve(&target));
    let proxy = tokio::time::timeout(LOOKUP_TIMEOUT, lookup)
        .await
        .map_err(|_| ProxyResolutionError::Timeout)??;
    Ok(builder
        .no_proxy()
        .proxy(Proxy::custom(move |_| proxy.clone())))
}

pub(crate) fn configure(settings: &NetworkProxySettings) -> Result<(), String> {
    let proxy_url = network_proxy_url(settings)?;
    let mut configured = NETWORK_PROXY
        .get_or_init(|| RwLock::new(None))
        .write()
        .map_err(|_| "Network proxy settings are temporarily unavailable".to_string())?;
    *configured = proxy_url;
    Ok(())
}

pub(crate) fn normalize_settings(
    mut settings: NetworkProxySettings,
) -> Result<NetworkProxySettings, String> {
    settings.proxy_url = settings.proxy_url.trim().to_string();
    if !settings.enabled {
        return Ok(settings);
    }
    let normalized_url = parse_network_proxy_base_url(&settings.proxy_url)?;
    if settings.proxy_port.is_none_or(|port| port == 0) {
        return Err("Enter a proxy port between 1 and 65535".to_string());
    }
    settings.proxy_url = normalized_url;
    Ok(settings)
}

fn configured_network_proxy() -> Option<Url> {
    let settings = NETWORK_PROXY.get()?;
    match settings.read() {
        Ok(proxy_url) => proxy_url.clone(),
        Err(error) => {
            eprintln!("network proxy settings lock was poisoned; using the last saved value");
            error.into_inner().clone()
        }
    }
}

fn network_proxy_url(settings: &NetworkProxySettings) -> Result<Option<Url>, String> {
    if !settings.enabled {
        return Ok(None);
    }
    let normalized = normalize_settings(settings.clone())?;
    let mut url =
        Url::parse(&normalized.proxy_url).map_err(|_| "Enter a valid proxy address".to_string())?;
    url.set_port(normalized.proxy_port)
        .map_err(|_| "Enter a valid proxy port".to_string())?;
    Ok(Some(url))
}

fn parse_network_proxy_base_url(value: &str) -> Result<String, String> {
    let value = if value.is_empty() {
        DEFAULT_NETWORK_PROXY_URL
    } else {
        value
    };
    let url =
        Url::parse(value).map_err(|_| "Enter a valid HTTP(S) or SOCKS proxy URL".to_string())?;
    let valid = supported_proxy_scheme(url.scheme())
        && url.host_str().is_some()
        && url.port().is_none()
        && matches!(url.path(), "" | "/")
        && url.query().is_none()
        && url.fragment().is_none();
    if !valid {
        return Err("Use an HTTP(S) or SOCKS proxy address without a port or path".to_string());
    }
    Ok(url.as_str().trim_end_matches('/').to_string())
}

#[cfg(test)]
mod tests;
#[cfg(test)]
mod transport_tests;
