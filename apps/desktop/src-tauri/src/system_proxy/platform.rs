#[cfg(any(target_os = "macos", target_os = "linux", test))]
use super::parsing::proxy_from_host_and_port;
#[cfg(any(not(target_os = "windows"), test))]
use super::SystemProxyConfig;

#[cfg(any(target_os = "macos", test))]
mod macos;

#[cfg(target_os = "windows")]
mod windows;
#[cfg(target_os = "windows")]
pub(super) use windows::{current_system_proxy, windows_auto_proxy_for};

#[cfg(target_os = "macos")]
pub(super) fn current_system_proxy() -> Option<SystemProxyConfig> {
    let output = std::process::Command::new("/usr/sbin/scutil")
        .arg("--proxy")
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    macos::parse(&String::from_utf8_lossy(&output.stdout))
}

#[cfg(target_os = "linux")]
pub(super) fn current_system_proxy() -> Option<SystemProxyConfig> {
    let mode = std::process::Command::new("gsettings")
        .args(["get", "org.gnome.system.proxy", "mode"])
        .output()
        .ok()?;
    if !mode.status.success() || String::from_utf8_lossy(&mode.stdout).trim() != "'manual'" {
        return None;
    }
    let config = SystemProxyConfig {
        http_proxy: gsettings_proxy("org.gnome.system.proxy.http", "http"),
        https_proxy: gsettings_proxy("org.gnome.system.proxy.https", "http"),
        socks_proxy: gsettings_proxy("org.gnome.system.proxy.socks", "socks5h"),
        bypass: gsettings_value("org.gnome.system.proxy", "ignore-hosts")
            .map(|value| parse_proxy_list(&value))
            .unwrap_or_default(),
        ..Default::default()
    };
    config.has_manual_proxy().then_some(config)
}

#[cfg(target_os = "linux")]
fn gsettings_proxy(schema: &str, scheme: &str) -> Option<reqwest::Url> {
    let host = gsettings_value(schema, "host")?;
    let port = gsettings_value(schema, "port").and_then(|port| port.parse().ok());
    proxy_from_host_and_port(&host, port, scheme)
}

#[cfg(target_os = "linux")]
fn parse_proxy_list(value: &str) -> Vec<String> {
    value
        .trim_matches(['[', ']'])
        .split(',')
        .map(|entry| entry.trim().trim_matches(['"', '\'']).to_string())
        .filter(|entry| !entry.is_empty())
        .collect()
}

#[cfg(target_os = "linux")]
fn gsettings_value(schema: &str, key: &str) -> Option<String> {
    let output = std::process::Command::new("gsettings")
        .args(["get", schema, key])
        .output()
        .ok()?;
    output.status.success().then(|| {
        String::from_utf8_lossy(&output.stdout)
            .trim()
            .trim_matches('"')
            .trim_matches('\'')
            .to_string()
    })
}

#[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
pub(super) fn current_system_proxy() -> Option<SystemProxyConfig> {
    None
}
