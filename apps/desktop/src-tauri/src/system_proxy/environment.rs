use std::net::IpAddr;

use reqwest::Url;

use super::{bypass::bypass_rule_matches, parsing::parse_proxy_endpoint, ProxyDecision};

pub(super) fn proxy_for(target: &Url) -> Option<ProxyDecision> {
    from_lookup(target, |name| std::env::var(name).ok())
}

fn from_lookup(target: &Url, lookup: impl Fn(&str) -> Option<String>) -> Option<ProxyDecision> {
    let no_proxy = lookup("NO_PROXY")
        .or_else(|| lookup("no_proxy"))
        .unwrap_or_default();
    if no_proxy
        .split(',')
        .any(|rule| bypasses(rule.trim(), target))
    {
        return Some(ProxyDecision::Direct);
    }
    let keys = match target.scheme() {
        "http" if lookup("REQUEST_METHOD").is_some() => ["http_proxy", "http_proxy"],
        "http" => ["HTTP_PROXY", "http_proxy"],
        "https" => ["HTTPS_PROXY", "https_proxy"],
        _ => return None,
    };
    keys.into_iter()
        .chain(["ALL_PROXY", "all_proxy"])
        .filter_map(lookup)
        .find_map(|value| parse_proxy_endpoint(&value, "http"))
        .map(ProxyDecision::Proxy)
}

fn bypasses(rule: &str, target: &Url) -> bool {
    let Some(host) = target.host_str() else {
        return true;
    };
    let host = host.trim_matches(['[', ']']).to_ascii_lowercase();
    if rule.contains('/') {
        return matches_subnet(rule, &host);
    }
    let rule = rule.to_ascii_lowercase();
    bypass_rule_matches(&rule, &host, target.port_or_known_default())
        || (!rule.is_empty() && host.ends_with(&format!(".{}", rule.trim_start_matches('.'))))
}

fn matches_subnet(rule: &str, host: &str) -> bool {
    let Some((network, prefix)) = rule.split_once('/') else {
        return false;
    };
    let (Ok(network), Ok(address), Ok(prefix)) = (
        network.parse::<IpAddr>(),
        host.parse::<IpAddr>(),
        prefix.parse::<u32>(),
    ) else {
        return false;
    };
    match (network, address) {
        (IpAddr::V4(network), IpAddr::V4(address)) if prefix <= 32 => {
            let mask = u32::MAX.checked_shl(32 - prefix).unwrap_or(0);
            u32::from(network) & mask == u32::from(address) & mask
        }
        (IpAddr::V6(network), IpAddr::V6(address)) if prefix <= 128 => {
            let mask = u128::MAX.checked_shl(128 - prefix).unwrap_or(0);
            u128::from(network) & mask == u128::from(address) & mask
        }
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn environment_proxy_precedence_and_cgi_exclusion() {
        let values = [
            ("HTTP_PROXY", "http://localhost:8000"),
            ("ALL_PROXY", "socks5h://localhost:1080"),
        ];
        let lookup = |key: &str| {
            values
                .iter()
                .find(|(name, _)| *name == key)
                .map(|(_, value)| value.to_string())
        };
        let target = Url::parse("http://api.example.com/v1").unwrap();
        assert_eq!(
            from_lookup(&target, lookup),
            Some(ProxyDecision::Proxy(Url::parse(values[0].1).unwrap()))
        );
        let cgi = |key: &str| {
            if key == "REQUEST_METHOD" {
                Some("GET".into())
            } else {
                lookup(key)
            }
        };
        assert_eq!(
            from_lookup(&target, cgi),
            Some(ProxyDecision::Proxy(Url::parse(values[1].1).unwrap()))
        );
        assert_eq!(
            from_lookup(&Url::parse("https://api.example.com").unwrap(), lookup),
            Some(ProxyDecision::Proxy(Url::parse(values[1].1).unwrap()))
        );
    }

    #[test]
    fn no_proxy_supports_domains_addresses_ports_and_subnets() {
        for (rule, target, expected) in [
            ("example.com", "https://api.example.com", true),
            ("example.com", "https://notexample.com", false),
            ("10.0.0.0/8", "http://10.2.3.4", true),
            ("10.0.0.0/8", "http://11.2.3.4", false),
            ("2001:db8::/32", "http://[2001:db8::1]", true),
            ("[::1]", "http://[::1]", true),
            ("example.com:443", "https://example.com", true),
            ("example.com:80", "https://example.com", false),
            ("*", "https://example.com", true),
        ] {
            assert_eq!(
                bypasses(rule, &Url::parse(target).unwrap()),
                expected,
                "{rule}: {target}"
            );
        }
        let target = Url::parse("https://api.example.com").unwrap();
        assert_eq!(
            from_lookup(&target, |key| (key == "NO_PROXY")
                .then(|| "example.com".into())),
            Some(ProxyDecision::Direct)
        );
    }
}
