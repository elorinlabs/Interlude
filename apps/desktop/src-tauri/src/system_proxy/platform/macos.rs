use std::collections::HashMap;

use super::{proxy_from_host_and_port, SystemProxyConfig};

/// `scutil` prints exception arrays across numbered lines, not as an inline list.
pub(super) fn parse(output: &str) -> Option<SystemProxyConfig> {
    let mut values = HashMap::new();
    let mut bypass = Vec::new();
    let mut in_exceptions = false;
    for line in output.lines().map(str::trim) {
        if line == "}" {
            in_exceptions = false;
            continue;
        }
        let Some((key, value)) = line.split_once(':') else {
            continue;
        };
        let (key, value) = (key.trim(), value.trim().trim_matches('"'));
        if in_exceptions {
            bypass.push(value.to_string());
        } else if key == "ExceptionsList" {
            in_exceptions = value.starts_with("<array>");
        } else {
            values.insert(key, value);
        }
    }
    if values.get("ExcludeSimpleHostnames") == Some(&"1") {
        bypass.push("<local>".to_string());
    }
    let config = SystemProxyConfig {
        http_proxy: proxy(&values, "HTTP", "http"),
        https_proxy: proxy(&values, "HTTPS", "http"),
        socks_proxy: proxy(&values, "SOCKS", "socks5h"),
        bypass,
        ..Default::default()
    };
    config.has_manual_proxy().then_some(config)
}

fn proxy(values: &HashMap<&str, &str>, kind: &str, scheme: &str) -> Option<reqwest::Url> {
    if values.get(format!("{kind}Enable").as_str()) != Some(&"1") {
        return None;
    }
    let host = values.get(format!("{kind}Proxy").as_str())?;
    let port = values
        .get(format!("{kind}Port").as_str())
        .and_then(|port| port.parse().ok());
    proxy_from_host_and_port(host, port, scheme)
}

#[cfg(test)]
mod tests {
    use super::*;
    use reqwest::Url;

    #[test]
    fn reads_socks_only_configuration_and_multiline_exceptions() {
        let config = parse(
            r#"<dictionary> {
            SOCKSEnable : 1
            SOCKSProxy : ::1
            SOCKSPort : 1080
            HTTPEnable : 0
            HTTPProxy : stale.example
            HTTPPort : 8080
            ExceptionsList : <array> {
                0 : *.internal.example
                1 : 10.*
            }
            ExcludeSimpleHostnames : 1
        }"#,
        )
        .unwrap();
        assert!(config.http_proxy.is_none());
        assert_eq!(
            config.socks_proxy.as_ref().map(Url::as_str),
            Some("socks5h://[::1]:1080")
        );
        for target in [
            "https://api.internal.example",
            "http://10.2.3.4",
            "http://intranet",
        ] {
            assert!(config
                .configured_proxy_for(&Url::parse(target).unwrap())
                .is_none());
        }
        assert!(config
            .configured_proxy_for(&Url::parse("https://api.example.com").unwrap())
            .is_some());
    }
}
