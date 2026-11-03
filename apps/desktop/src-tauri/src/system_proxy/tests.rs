use reqwest::Url;

use crate::models::NetworkProxySettings;

use super::{
    bypass::{bypass_rule_matches, should_proxy_target, wildcard_matches},
    network_proxy_url, normalize_settings,
    parsing::{parse_proxy_endpoint, parse_proxy_result, parse_windows_proxy},
    ProxyDecision,
};

#[test]
fn normalizes_enabled_network_proxy() {
    let normalized = normalize_settings(NetworkProxySettings {
        enabled: true,
        proxy_url: " http://127.0.0.1/ ".to_string(),
        proxy_port: Some(7897),
    })
    .expect("proxy should normalize");

    assert_eq!(normalized.proxy_url, "http://127.0.0.1");
    assert_eq!(
        network_proxy_url(&normalized)
            .expect("proxy should parse")
            .map(|url| url.to_string()),
        Some("http://127.0.0.1:7897/".to_string())
    );
}

#[test]
fn blank_network_proxy_address_defaults_to_loopback() {
    for address in ["", " \t "] {
        let settings = NetworkProxySettings {
            enabled: true,
            proxy_url: address.to_string(),
            proxy_port: Some(7897),
        };
        let normalized = normalize_settings(settings.clone()).unwrap();
        assert_eq!(normalized.proxy_url, "http://127.0.0.1");
        assert_eq!(
            network_proxy_url(&settings).unwrap().unwrap().as_str(),
            "http://127.0.0.1:7897/"
        );
        assert_eq!(normalize_settings(normalized.clone()).unwrap(), normalized);
    }
}

#[test]
fn blank_network_proxy_address_still_requires_a_port() {
    for proxy_port in [None, Some(0)] {
        let error = normalize_settings(NetworkProxySettings {
            enabled: true,
            proxy_url: String::new(),
            proxy_port,
        })
        .unwrap_err();
        assert!(error.contains("proxy port"));
    }
}

#[test]
fn disabled_blank_network_proxy_stays_disabled() {
    let settings = NetworkProxySettings::default();
    assert_eq!(normalize_settings(settings.clone()).unwrap(), settings);
    assert!(network_proxy_url(&settings).unwrap().is_none());
}

#[test]
fn rejects_enabled_network_proxy_without_port() {
    let error = normalize_settings(NetworkProxySettings {
        enabled: true,
        proxy_url: "http://127.0.0.1".to_string(),
        proxy_port: None,
    })
    .expect_err("missing port should fail");

    assert!(error.contains("proxy port"));

    let zero_port_error = normalize_settings(NetworkProxySettings {
        enabled: true,
        proxy_url: "http://127.0.0.1".to_string(),
        proxy_port: Some(0),
    })
    .expect_err("zero port should fail");
    assert!(zero_port_error.contains("proxy port"));
}

#[test]
fn rejects_proxy_address_without_url_scheme() {
    let error = normalize_settings(NetworkProxySettings {
        enabled: true,
        proxy_url: "127.0.0.1".to_string(),
        proxy_port: Some(7897),
    })
    .expect_err("proxy address without a URL scheme should fail");

    assert!(error.contains("proxy URL"));
}

#[test]
fn explicit_network_proxy_bypasses_loopback_targets() {
    assert!(!should_proxy_target(
        &Url::parse("http://localhost:1455/callback").unwrap()
    ));
    assert!(!should_proxy_target(
        &Url::parse("http://127.0.0.1:3000/api").unwrap()
    ));
    assert!(should_proxy_target(
        &Url::parse("https://api.openai.com/v1/models").unwrap()
    ));
}

#[test]
fn parses_clash_style_single_proxy_for_http_and_https() {
    let config = parse_windows_proxy("127.0.0.1:7897", Some("<local>;localhost;127.*"))
        .expect("proxy should parse");

    assert_eq!(
        config.default_proxy.as_ref().map(|url| url.as_str()),
        Some("http://127.0.0.1:7897/")
    );
    assert_eq!(config.bypass, ["<local>", "localhost", "127.*"]);
    assert_eq!(
        config
            .configured_proxy_for(&Url::parse("https://auth.openai.com/oauth").unwrap())
            .as_ref()
            .map(Url::as_str),
        Some("http://127.0.0.1:7897/")
    );
    assert!(config
        .configured_proxy_for(&Url::parse("http://localhost:1455/auth/callback").unwrap())
        .is_none());
}

#[test]
fn parses_protocol_specific_windows_proxy_list() {
    let config = parse_windows_proxy(
        "http=127.0.0.1:7890;https=127.0.0.1:7891;socks=127.0.0.1:7892",
        None,
    )
    .expect("proxy should parse");

    assert_eq!(
        config.http_proxy.as_ref().map(|url| url.as_str()),
        Some("http://127.0.0.1:7890/")
    );
    assert_eq!(
        config.https_proxy.as_ref().map(|url| url.as_str()),
        Some("http://127.0.0.1:7891/")
    );
    assert!(config.default_proxy.is_none());
}

#[test]
fn parses_winhttp_autoproxy_results_without_treating_direct_as_a_host() {
    let target = Url::parse("https://example.com/path").unwrap();
    assert_eq!(
        parse_proxy_result("PROXY 127.0.0.1:7890; DIRECT", &target),
        Some(ProxyDecision::Proxy(
            Url::parse("http://127.0.0.1:7890/").unwrap()
        ))
    );
    assert_eq!(
        parse_proxy_result("DIRECT", &target),
        Some(ProxyDecision::Direct)
    );
    assert!(parse_proxy_endpoint("DIRECT", "http").is_none());
}

#[test]
fn matches_windows_proxy_bypass_rules() {
    assert!(bypass_rule_matches("<local>", "intranet", Some(80)));
    assert!(!bypass_rule_matches("<local>", "example.com", Some(80)));
    assert!(bypass_rule_matches(
        "*.example.com",
        "api.example.com",
        Some(443)
    ));
    assert!(bypass_rule_matches("10.*", "10.2.3.4", Some(80)));
    assert!(bypass_rule_matches(
        "localhost:3000",
        "localhost",
        Some(3000)
    ));
    assert!(!bypass_rule_matches(
        "localhost:3000",
        "localhost",
        Some(3001)
    ));
    assert!(wildcard_matches("*", "anything.example"));
}

#[test]
fn supports_manual_socks_addresses_and_rejects_non_proxy_urls() {
    for scheme in ["http", "https", "socks4", "socks4a", "socks5", "socks5h"] {
        let settings = NetworkProxySettings {
            enabled: true,
            proxy_url: format!("{scheme}://127.0.0.1"),
            proxy_port: Some(1080),
        };
        let url = network_proxy_url(&settings).unwrap().unwrap();
        assert_eq!(url.scheme(), scheme);
        assert_eq!(url.port(), Some(1080));
        assert!(reqwest::Proxy::all(url).is_ok());
    }
    for address in [
        "file:///tmp/proxy",
        "ftp://localhost",
        "socks5://localhost/path",
        "socks5://localhost?query",
        "http://localhost:8080",
    ] {
        assert!(
            normalize_settings(NetworkProxySettings {
                enabled: true,
                proxy_url: address.into(),
                proxy_port: Some(1080),
            })
            .is_err(),
            "{address}"
        );
    }
}

#[test]
fn windows_socks_only_proxy_is_used_for_both_http_and_https() {
    for (server, expected) in [
        ("socks=127.0.0.1:1080", "socks4a://127.0.0.1:1080"),
        ("socks=socks5h://127.0.0.1:1080", "socks5h://127.0.0.1:1080"),
        ("socks5=127.0.0.1:1080", "socks5h://127.0.0.1:1080"),
        ("socks5h://127.0.0.1:1080", "socks5h://127.0.0.1:1080"),
    ] {
        let config = parse_windows_proxy(server, None).unwrap();
        for target in ["http://example.com", "https://example.com"] {
            assert_eq!(
                config.configured_proxy_for(&Url::parse(target).unwrap()),
                Some(Url::parse(expected).unwrap())
            );
        }
    }
}

#[test]
fn winhttp_results_respect_protocols_direct_order_and_server_lists() {
    let target = Url::parse("https://example.com/complete/path").unwrap();
    for (value, expected) in [
        ("127.0.0.1:8080;127.0.0.1:8081", "http://127.0.0.1:8080/"),
        (
            "http=127.0.0.1:8080;https=127.0.0.1:8081",
            "http://127.0.0.1:8081/",
        ),
        (
            "http=127.0.0.1:8080 https=127.0.0.1:8081",
            "http://127.0.0.1:8081/",
        ),
        ("SOCKS5 127.0.0.1:1080; DIRECT", "socks5h://127.0.0.1:1080"),
        ("SOCKS 127.0.0.1:1080; DIRECT", "socks4a://127.0.0.1:1080"),
        ("HTTPS 127.0.0.1:8443; DIRECT", "https://127.0.0.1:8443/"),
    ] {
        assert_eq!(
            parse_proxy_result(value, &target),
            Some(ProxyDecision::Proxy(Url::parse(expected).unwrap())),
            "{value}"
        );
    }
    assert_eq!(
        parse_proxy_result("DIRECT; PROXY 127.0.0.1:8080", &target),
        Some(ProxyDecision::Direct)
    );
    assert!(parse_proxy_result("", &target).is_none());
}

#[test]
fn loopback_and_windows_bypass_rules_stay_direct() {
    let config =
        parse_windows_proxy("127.0.0.1:8080", Some("<local> *.internal.example 10.*")).unwrap();
    for target in [
        "http://localhost",
        "http://localhost.",
        "http://127.0.0.2",
        "http://[::1]",
    ] {
        assert!(!should_proxy_target(&Url::parse(target).unwrap()));
    }
    for target in [
        "http://intranet",
        "https://api.internal.example",
        "http://10.2.3.4",
    ] {
        assert!(config
            .configured_proxy_for(&Url::parse(target).unwrap())
            .is_none());
    }
    assert!(!bypass_rule_matches("<local>", "2001:db8::1", Some(80)));
}
