use serde::{Deserialize, Serialize};
use std::time::Duration;

const DEFAULT_TIMEOUT_SECONDS: u64 = 600;
const MAX_TIMEOUT_SECONDS: u64 = 3_600;

/// Wait after the request body reaches the transport, before response headers arrive.
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub(crate) struct ResponseHeaderTimeoutSettings {
    pub(crate) timeout_seconds: u64,
}

impl Default for ResponseHeaderTimeoutSettings {
    fn default() -> Self {
        Self {
            timeout_seconds: DEFAULT_TIMEOUT_SECONDS,
        }
    }
}

#[derive(Debug, thiserror::Error)]
#[error("Waiting time must be between 1 and 3600 seconds")]
pub(crate) struct InvalidResponseHeaderTimeout;

impl ResponseHeaderTimeoutSettings {
    pub(crate) fn validate(self) -> Result<(), InvalidResponseHeaderTimeout> {
        if !(1..=MAX_TIMEOUT_SECONDS).contains(&self.timeout_seconds) {
            return Err(InvalidResponseHeaderTimeout);
        }
        Ok(())
    }

    pub(crate) fn duration(self) -> Duration {
        Duration::from_secs(self.timeout_seconds.clamp(1, MAX_TIMEOUT_SECONDS))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn legacy_settings_default_to_ten_minutes_without_changing_sse() {
        let settings: crate::models::AppSettings = serde_json::from_str("{}").unwrap();
        assert_eq!(
            settings.response_header_timeout.duration(),
            Duration::from_secs(600)
        );
        assert_eq!(
            settings.sse_idle_timeout.duration(),
            Some(Duration::from_secs(240))
        );
    }

    #[test]
    fn custom_wait_survives_settings_round_trip() {
        let settings: crate::models::AppSettings =
            serde_json::from_str(r#"{"responseHeaderTimeout":{"timeoutSeconds":900}}"#).unwrap();
        let saved = serde_json::to_string(&settings).unwrap();
        let restored: crate::models::AppSettings = serde_json::from_str(&saved).unwrap();
        assert_eq!(
            restored.response_header_timeout.duration(),
            Duration::from_secs(900)
        );
    }

    #[test]
    fn rejects_invalid_durations_and_bounds_manually_edited_settings() {
        for seconds in [0, MAX_TIMEOUT_SECONDS + 1, u64::MAX] {
            let settings = ResponseHeaderTimeoutSettings {
                timeout_seconds: seconds,
            };
            assert!(settings.validate().is_err());
            assert!((1..=MAX_TIMEOUT_SECONDS).contains(&settings.duration().as_secs()));
        }
        for seconds in [1, DEFAULT_TIMEOUT_SECONDS, MAX_TIMEOUT_SECONDS] {
            assert!(ResponseHeaderTimeoutSettings {
                timeout_seconds: seconds
            }
            .validate()
            .is_ok());
        }
    }
}
