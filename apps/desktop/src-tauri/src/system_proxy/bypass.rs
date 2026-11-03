use reqwest::Url;

pub(super) fn should_proxy_target(target: &Url) -> bool {
    let Some(host) = target.host_str() else {
        return false;
    };
    let host = host.trim_matches(['[', ']']);
    host.trim_end_matches('.') != "localhost"
        && !host
            .parse::<std::net::IpAddr>()
            .is_ok_and(|address| address.is_loopback())
}

pub(super) fn bypass_rule_matches(rule: &str, host: &str, port: Option<u16>) -> bool {
    let rule = rule.trim().to_ascii_lowercase();
    if rule.is_empty() {
        return false;
    }
    if rule == "<local>" {
        return !host.contains('.') && !host.contains(':');
    }
    if rule.starts_with("<-") && rule.ends_with('>') {
        return false;
    }

    let rule = rule
        .strip_prefix("http://")
        .or_else(|| rule.strip_prefix("https://"))
        .unwrap_or(&rule)
        .trim_end_matches('/');
    let (rule_host, rule_port) = split_bypass_host_port(rule);
    if rule_port.is_some() && rule_port != port {
        return false;
    }
    if let Some(suffix) = rule_host.strip_prefix('.') {
        return host == suffix || host.ends_with(&format!(".{suffix}"));
    }
    wildcard_matches(rule_host, host)
}

fn split_bypass_host_port(rule: &str) -> (&str, Option<u16>) {
    if let Some(rest) = rule.strip_prefix('[') {
        if let Some(closing) = rest.find(']') {
            let host = &rest[..closing];
            let port = rest[closing + 1..]
                .strip_prefix(':')
                .and_then(|value| value.parse().ok());
            return (host, port);
        }
    }
    if rule.matches(':').count() == 1 {
        if let Some((host, port)) = rule.rsplit_once(':') {
            if let Ok(port) = port.parse() {
                return (host, Some(port));
            }
        }
    }
    (rule.trim_matches(['[', ']']), None)
}

pub(super) fn wildcard_matches(pattern: &str, value: &str) -> bool {
    let (pattern, value) = (pattern.as_bytes(), value.as_bytes());
    let (mut pattern_index, mut value_index) = (0, 0);
    let (mut star_index, mut star_value_index) = (None, 0);

    while value_index < value.len() {
        if pattern_index < pattern.len() && pattern[pattern_index] == value[value_index] {
            pattern_index += 1;
            value_index += 1;
        } else if pattern_index < pattern.len() && pattern[pattern_index] == b'*' {
            star_index = Some(pattern_index);
            pattern_index += 1;
            star_value_index = value_index;
        } else if let Some(star) = star_index {
            pattern_index = star + 1;
            star_value_index += 1;
            value_index = star_value_index;
        } else {
            return false;
        }
    }
    while pattern_index < pattern.len() && pattern[pattern_index] == b'*' {
        pattern_index += 1;
    }
    pattern_index == pattern.len()
}
