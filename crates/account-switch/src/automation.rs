//! Persisted scheduling decisions. Network and desktop actions belong to the application layer.
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreheatPlan {
    pub next_at: i64,
    #[serde(default)]
    pub quota_reset_at: Option<i64>,
    pub last_sent_at: Option<i64>,
    /// Persist before sending: after an ambiguous crash the user must explicitly re-enable.
    pub in_flight: bool,
    pub retry_at: i64,
    pub failures: u32,
    pub status: String,
    #[serde(default)]
    pub last_error: Option<String>,
}

impl PreheatPlan {
    pub fn due(&self, now: i64) -> bool {
        !self.in_flight && now >= self.retry_at
    }

    pub fn begin(&mut self) {
        self.in_flight = true;
        self.status = "sending".into();
        self.last_error = None;
    }

    pub fn sent(&mut self, sent_at: i64) {
        self.in_flight = false;
        self.last_sent_at = Some(sent_at);
        self.quota_reset_at = None;
        self.next_at = 0;
        self.retry_at = sent_at.saturating_add(120);
        self.failures = 0;
        self.status = "scheduled".into();
        self.last_error = None;
    }

    pub fn observe_reset(&mut self, now: i64, reset: Option<i64>) -> bool {
        if self
            .quota_reset_at
            .is_some_and(|at| at <= now && self.last_sent_at.is_none_or(|sent| sent < at))
        {
            return true;
        }
        self.quota_reset_at = reset.filter(|at| *at > now);
        self.next_at = self.quota_reset_at.unwrap_or(0);
        self.retry_at = self.next_at.max(now + 5).min(now + 300);
        self.status = "waitingQuota".into();
        false
    }

    pub fn defer(&mut self, now: i64, reset_at: Option<i64>) {
        self.next_at = reset_at.filter(|reset| *reset > now).unwrap_or(0);
        self.retry_at = self.next_at.max(now + 5).min(now + 300) + 5;
        self.status = "waitingQuota".into();
    }

    pub fn failed_probe(&mut self, now: i64) {
        self.failures = self.failures.saturating_add(1);
        self.retry_at = now + retry_delay(self.failures);
        self.status = "retrying".into();
    }

    pub fn failed_send(&mut self, now: i64, error: String) {
        self.in_flight = false;
        self.failures = self.failures.saturating_add(1);
        self.retry_at = now + retry_delay(self.failures);
        self.status = "retrying".into();
        self.last_error = Some(error);
    }
}

pub fn retry_delay(failures: u32) -> i64 {
    (60_i64 * (1_i64 << failures.min(4))).min(900)
}

pub fn has_quota(primary: Option<f64>, secondary: Option<f64>) -> bool {
    primary.is_some_and(|value| value.is_finite() && value > 0.0)
        && secondary.is_none_or(|value| value.is_finite() && value > 0.0)
}

/// Only the explicit goal state authored by Codex allows automatic handover.
pub fn can_relay(status: &str, used: i64, budget: Option<i64>) -> bool {
    status == "usage_limited" && budget.is_none_or(|limit| used < limit)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn a_crash_during_send_does_not_send_again() {
        let mut plan = PreheatPlan::default();
        assert!(plan.due(10));
        plan.begin();
        let restored: PreheatPlan =
            serde_json::from_str(&serde_json::to_string(&plan).unwrap()).unwrap();
        assert!(!restored.due(100_000));
    }
    #[test]
    fn greeting_follows_observed_reset_instead_of_send_time() {
        let mut plan = PreheatPlan::default();
        assert!(!plan.observe_reset(100, Some(400)));
        assert!(!plan.observe_reset(200, Some(450)));
        assert!(!plan.observe_reset(400, Some(450)));
        assert!(plan.observe_reset(450, Some(900)));
        plan.sent(451);
        assert!(!plan.observe_reset(600, None));
        assert!(!plan.observe_reset(700, Some(900)));
        assert!(plan.observe_reset(900, Some(1200)));
    }
    #[test]
    fn exhausted_weekly_or_unknown_primary_never_selects_an_account() {
        assert!(!has_quota(Some(80.0), Some(0.0)));
        assert!(!has_quota(None, Some(100.0)));
        assert!(!has_quota(Some(f64::NAN), None));
        assert!(has_quota(Some(20.0), Some(60.0)));
    }
    #[test]
    fn manual_pause_completion_and_budget_limits_never_trigger_handover() {
        for status in ["active", "paused", "blocked", "budget_limited", "complete"] {
            assert!(!can_relay(status, 10, Some(100)));
        }
        assert!(!can_relay("usage_limited", 100, Some(100)));
        assert!(can_relay("usage_limited", 10, Some(100)));
    }
    #[test]
    fn backoff_is_bounded_and_does_not_catch_up_in_a_burst() {
        assert_eq!(retry_delay(1), 120);
        assert_eq!(retry_delay(100), 900);
        let mut plan = PreheatPlan::default();
        plan.defer(1000, Some(1));
        assert!(!plan.due(1001));
        assert!(plan.due(1125));
    }
}
