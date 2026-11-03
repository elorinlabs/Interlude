use reqwest::Url;

#[cfg(any(windows, test))]
use super::{ProxyDecision, SystemProxyConfig};

pub(super) fn supported_proxy_scheme(scheme: &str) -> bool {
    matches!(
        scheme,
        "http" | "https" | "socks4" | "socks4a" | "socks5" | "socks5h"
    )
}

pub(super) fn parse_proxy_endpoint(endpoint: &str, default_scheme: &str) -> Option<Url> {
    let endpoint = endpoint.trim().trim_matches('"');
    if endpoint.is_empty() || endpoint.eq_ignore_ascii_case("DIRECT") {
        return None;
    }
    let value = if endpoint.contains("://") {
        endpoint.to_string()
    } else {
        format!("{default_scheme}://{endpoint}")
    };
    Url::parse(&value).ok().filter(|url| {
        supported_proxy_scheme(url.scheme())
            && url.host_str().is_some()
            && matches!(url.path(), "" | "/")
            && url.query().is_none()
            && url.fragment().is_none()
            && url.port() != Some(0)
    })
}

#[cfg(any(windows, test))]
pub(super) fn parse_windows_proxy(
    proxy_server: &str,
    proxy_bypass: Option<&str>,
) -> Option<SystemProxyConfig> {
    let mut config = SystemProxyConfig {
        bypass: split_windows_list(proxy_bypass.unwrap_or_default())
            .map(str::to_string)
            .collect(),
        ..SystemProxyConfig::default()
    };
    for entry in split_windows_list(proxy_server) {
        let (kind, endpoint) = entry.split_once('=').unwrap_or(("", entry));
        let (slot, scheme) = match kind.to_ascii_lowercase().as_str() {
            "" => (&mut config.default_proxy, "http"),
            "http" => (&mut config.http_proxy, "http"),
            "https" => (&mut config.https_proxy, "http"),
            // WinINET's unqualified SOCKS mapping denotes SOCKS4, not SOCKS5.
            "socks" | "socks4" => (&mut config.socks_proxy, "socks4a"),
            "socks5" => (&mut config.socks_proxy, "socks5h"),
            _ => continue,
        };
        if slot.is_none() {
            *slot = parse_proxy_endpoint(endpoint, scheme);
        }
    }
    config.has_manual_proxy().then_some(config)
}

#[cfg(any(windows, test))]
fn split_windows_list(value: &str) -> impl Iterator<Item = &str> {
    value
        .split(|character: char| character == ';' || character.is_whitespace())
        .filter(|entry| !entry.is_empty())
}

/// Accept both PAC directives and WinHTTP's protocol-specific server lists.
#[cfg(any(windows, test))]
pub(super) fn parse_proxy_result(value: &str, target: &Url) -> Option<ProxyDecision> {
    for entry in value
        .split(';')
        .map(str::trim)
        .filter(|entry| !entry.is_empty())
    {
        let mut parts = entry.split_whitespace();
        let kind = parts.next()?.to_ascii_uppercase();
        if kind == "DIRECT" {
            return Some(ProxyDecision::Direct);
        }
        let scheme = match kind.as_str() {
            "PROXY" | "HTTP" => Some("http"),
            "HTTPS" => Some("https"),
            "SOCKS" | "SOCKS4" => Some("socks4a"),
            "SOCKS5" => Some("socks5h"),
            _ => None,
        };
        let proxy = match scheme {
            Some(scheme) => parts
                .next()
                .and_then(|endpoint| parse_proxy_endpoint(endpoint, scheme)),
            None => parse_windows_proxy(entry, None)
                .and_then(|config| config.configured_proxy_for(target)),
        };
        if let Some(proxy) = proxy {
            return Some(ProxyDecision::Proxy(proxy));
        }
    }
    None
}

#[cfg(any(target_os = "macos", target_os = "linux", test))]
pub(super) fn proxy_from_host_and_port(host: &str, port: Option<u16>, scheme: &str) -> Option<Url> {
    let port = port.filter(|port| *port != 0)?;
    let host = host.trim().trim_matches(['[', ']']);
    let host = if host.contains(':') {
        format!("[{host}]")
    } else {
        host.to_string()
    };
    let mut url = parse_proxy_endpoint(&host, scheme)?;
    url.set_port(Some(port)).ok()?;
    Some(url)
}
