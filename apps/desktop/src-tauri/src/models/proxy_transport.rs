use serde::{Deserialize, Serialize};

/// Counts exclude the initial request. Zero disables retries or redirects.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub(crate) struct ProxyTransportSettings {
    pub(crate) network_retry_count: u32,
    pub(crate) max_redirects: u32,
}

impl Default for ProxyTransportSettings {
    fn default() -> Self {
        Self {
            network_retry_count: 6,
            max_redirects: 10,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_counts_use_defaults_and_zero_survives_round_trip() {
        let settings: ProxyTransportSettings = serde_json::from_str("{}").unwrap();
        assert_eq!(settings.network_retry_count, 6);
        assert_eq!(settings.max_redirects, 10);
        let disabled = ProxyTransportSettings {
            network_retry_count: 0,
            max_redirects: 0,
        };
        assert_eq!(
            serde_json::from_value::<ProxyTransportSettings>(
                serde_json::to_value(disabled).unwrap()
            )
            .unwrap(),
            disabled
        );
        for invalid in [
            r#"{"networkRetryCount":-1}"#,
            r#"{"maxRedirects":1.5}"#,
            r#"{"maxRedirects":4294967296}"#,
        ] {
            assert!(serde_json::from_str::<ProxyTransportSettings>(invalid).is_err());
        }
    }
}
