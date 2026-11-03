//! Only public, versioned upstream installation assets may join the sharing cache.
pub(super) const CODEX: &str = "codex-cli";
pub(super) const COMPUTER_USE: &str = "computer-use";
pub(super) const MAX_DRIVER_BYTES: usize = 64 * 1024 * 1024;

#[derive(Clone, Copy, Debug, serde::Deserialize, serde::Serialize, PartialEq)]
#[serde(rename_all = "kebab-case")]
pub(super) enum Kind {
    Codex,
    ComputerUse,
}

impl Kind {
    pub(super) fn from_target(target: &str) -> Option<Self> {
        match target {
            CODEX => Some(Self::Codex),
            COMPUTER_USE => Some(Self::ComputerUse),
            _ => None,
        }
    }

    pub(super) fn target(self) -> &'static str {
        match self {
            Self::Codex => CODEX,
            Self::ComputerUse => COMPUTER_USE,
        }
    }
}

pub(super) fn valid_url(kind: &str, version: &str, url: &str) -> bool {
    if version.len() >= 80 || semver::Version::parse(version).is_err() {
        return false;
    }
    match kind {
        CODEX => codex_urls(version).iter().any(|expected| expected == url),
        COMPUTER_USE => driver_urls(version).iter().any(|expected| expected == url),
        _ => false,
    }
}

fn codex_urls(version: &str) -> Vec<String> {
    let mut urls = Vec::new();
    let release = format!("https://github.com/openai/codex/releases/download/rust-v{version}");
    for arch in ["x86_64", "aarch64"] {
        for platform in ["pc-windows-msvc", "apple-darwin", "unknown-linux-musl"] {
            urls.push(format!("{release}/codex-package-{arch}-{platform}.tar.gz"));
        }
    }
    urls
}

fn driver_urls(version: &str) -> Vec<String> {
    ["windows-x86_64.zip", "windows-arm64.zip", "darwin-universal-binary.tar.gz"]
        .iter()
        .map(|asset| format!(
            "https://github.com/piperhex/remoteai/releases/download/cua-v{version}/cua-driver-rs-{version}-{asset}"
        ))
        .collect()
}
