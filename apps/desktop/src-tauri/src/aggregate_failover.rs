use serde::{Deserialize, Serialize};

const DEFAULT_RETRY_STATUS_CODES: &[u16] = &[408, 425, 429, 500, 502, 503, 504];
const MAX_RETRY_STATUS_CODES: usize = 32;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum AggregateRoutingStrategy {
    #[default]
    Balanced,
    Priority,
}

/// Controls retries within one request and health recovery across requests.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default, deny_unknown_fields)]
pub(crate) struct AggregateFailoverPolicy {
    pub(crate) routing_strategy: AggregateRoutingStrategy,
    pub(crate) recovery_success_threshold: u32,
    pub(crate) error_rate_threshold_percent: Option<u32>,
    pub(crate) error_rate_min_requests: u32,
    pub(crate) enabled: bool,
    pub(crate) max_attempts: u32,
    pub(crate) failure_threshold: u32,
    pub(crate) initial_cooldown_seconds: u64,
    pub(crate) max_cooldown_seconds: u64,
    pub(crate) retry_status_codes: Vec<u16>,
    pub(crate) retry_on_network_errors: bool,
    pub(crate) respect_retry_after: bool,
}

impl Default for AggregateFailoverPolicy {
    fn default() -> Self {
        Self {
            routing_strategy: AggregateRoutingStrategy::Balanced,
            recovery_success_threshold: 1,
            error_rate_threshold_percent: None,
            error_rate_min_requests: 10,
            enabled: true,
            max_attempts: 3,
            failure_threshold: 2,
            initial_cooldown_seconds: 5,
            max_cooldown_seconds: 60,
            retry_status_codes: DEFAULT_RETRY_STATUS_CODES.to_vec(),
            retry_on_network_errors: true,
            respect_retry_after: true,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, thiserror::Error)]
pub(crate) enum AggregateFailoverPolicyError {
    #[error("Recovery requires between 1 and 10 successful probes")]
    RecoveryThreshold,
    #[error("The error rate must be between 1 and 100 percent, with 1 to 100 requests")]
    ErrorRate,
    #[error("The maximum attempts must be between 1 and 20")]
    Attempts,
    #[error("The failure threshold must be between 1 and 10")]
    Threshold,
    #[error("The initial cooldown must be between 1 and 300 seconds")]
    InitialCooldown,
    #[error("The maximum cooldown must be at least the initial cooldown and at most 3600 seconds")]
    MaxCooldown,
    #[error("Choose at most 32 retry status codes between 400 and 599")]
    StatusCodes,
}

impl AggregateFailoverPolicy {
    pub(crate) fn validate(&self) -> Result<(), AggregateFailoverPolicyError> {
        if !(1..=10).contains(&self.recovery_success_threshold) {
            return Err(AggregateFailoverPolicyError::RecoveryThreshold);
        }
        if !(1..=100).contains(&self.error_rate_min_requests)
            || self
                .error_rate_threshold_percent
                .is_some_and(|rate| !(1..=100).contains(&rate))
        {
            return Err(AggregateFailoverPolicyError::ErrorRate);
        }
        if !(1..=20).contains(&self.max_attempts) {
            return Err(AggregateFailoverPolicyError::Attempts);
        }
        if !(1..=10).contains(&self.failure_threshold) {
            return Err(AggregateFailoverPolicyError::Threshold);
        }
        if !(1..=300).contains(&self.initial_cooldown_seconds) {
            return Err(AggregateFailoverPolicyError::InitialCooldown);
        }
        if !(self.initial_cooldown_seconds..=3600).contains(&self.max_cooldown_seconds) {
            return Err(AggregateFailoverPolicyError::MaxCooldown);
        }
        if self.retry_status_codes.len() > MAX_RETRY_STATUS_CODES
            || self
                .retry_status_codes
                .iter()
                .any(|code| !(400..=599).contains(code))
        {
            return Err(AggregateFailoverPolicyError::StatusCodes);
        }
        Ok(())
    }

    pub(crate) fn normalize(&mut self) -> Result<(), AggregateFailoverPolicyError> {
        self.validate()?;
        self.retry_status_codes.sort_unstable();
        self.retry_status_codes.dedup();
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn old_config_uses_safe_defaults_and_partial_settings_keep_other_defaults() {
        let default: AggregateFailoverPolicy = serde_json::from_value(json!({})).unwrap();
        assert_eq!(default, AggregateFailoverPolicy::default());
        let custom: AggregateFailoverPolicy =
            serde_json::from_value(json!({"maxAttempts": 1})).unwrap();
        assert_eq!(custom.max_attempts, 1);
        assert_eq!(custom.failure_threshold, default.failure_threshold);
    }

    #[test]
    fn rejects_invalid_ranges_and_unknown_options() {
        for value in [
            json!({"maxAttempts": 0}),
            json!({"maxAttempts": 21}),
            json!({"failureThreshold": 0}),
            json!({"failureThreshold": 11}),
            json!({"initialCooldownSeconds": 0}),
            json!({"initialCooldownSeconds": 301}),
            json!({"maxCooldownSeconds": 4}),
            json!({"maxCooldownSeconds": 3601}),
            json!({"retryStatusCodes": [399]}),
            json!({"retryStatusCodes": [600]}),
            json!({"retryStatusCodes": vec![500; 33]}),
        ] {
            let invalid: AggregateFailoverPolicy = serde_json::from_value(value).unwrap();
            assert!(invalid.validate().is_err());
        }
        assert!(
            serde_json::from_value::<AggregateFailoverPolicy>(json!({"maxRetries": 2})).is_err()
        );
    }

    #[test]
    fn normalizes_status_codes_without_requiring_http_retries() {
        let mut policy = AggregateFailoverPolicy {
            retry_status_codes: vec![503, 429, 503],
            ..Default::default()
        };
        policy.normalize().unwrap();
        assert_eq!(policy.retry_status_codes, [429, 503]);
        policy.retry_status_codes.clear();
        assert!(policy.validate().is_ok());
    }
}
