use super::*;
use crate::aggregate_failover::AggregateRoutingStrategy;
use std::collections::VecDeque;

const MAX_ASSIGNMENTS: usize = 10_000;
const MAX_SESSION_ID_BYTES: usize = 1024;
const ASSIGNMENT_TTL: Duration = Duration::from_secs(24 * 60 * 60);
const MAX_SERVER_RETRY_DELAY: Duration = Duration::from_secs(24 * 60 * 60);
const ERROR_RATE_WINDOW: usize = 100;

#[derive(Default)]
pub(super) struct AggregateRuntime {
    pub(super) members: HashMap<String, MemberRuntime>,
    assignments: HashMap<String, Assignment>,
    next_index: usize,
}

struct Assignment {
    member_id: String,
    lease_id: u64,
    last_used: Instant,
}

#[derive(Default)]
pub(super) struct MemberRuntime {
    // Generations distinguish recreated members; epochs invalidate requests before a circuit change.
    generation: u64,
    epoch: u64,
    failure_version: u64,
    consecutive_failures: u32,
    retry_at: Option<Instant>,
    probe_lease_id: Option<u64>,
    recovery_successes: u32,
    outcomes: VecDeque<bool>,
}

pub(super) struct LeaseToken {
    pub(super) member_id: String,
    pub(super) aggregate_id: String,
    session_id: Option<String>,
    lease_id: u64,
    generation: u64,
    epoch: u64,
    failure_version: u64,
}

impl AggregateRuntime {
    pub(super) fn select(
        &mut self,
        options: &SelectionOptions<'_>,
        lease_id: u64,
        now: Instant,
    ) -> Result<LeaseToken, String> {
        self.retain(options.member_ids, lease_id, now);
        let selected = self
            .sticky_member(options)
            .or_else(|| self.routed_member(options, now))
            .ok_or_else(|| "All APIs in this aggregate are temporarily unavailable".to_string())?;
        let Some(member) = self.members.get_mut(&selected) else {
            return Err("The selected API is no longer available".to_string());
        };
        if options.policy.enabled && member.retry_at.is_some() {
            member.probe_lease_id = Some(lease_id);
        }
        let session_id = usable_session(options.session_id).map(str::to_string);
        let token = LeaseToken {
            member_id: selected.clone(),
            aggregate_id: options.aggregate_id.to_string(),
            session_id: session_id.clone(),
            lease_id,
            generation: member.generation,
            epoch: member.epoch,
            failure_version: member.failure_version,
        };
        if let Some(session_id) = session_id {
            self.save_assignment(
                session_id,
                Assignment {
                    member_id: selected,
                    lease_id,
                    last_used: now,
                },
            );
        }
        Ok(token)
    }

    pub(super) fn finish(
        &mut self,
        token: LeaseToken,
        outcome: MemberOutcome,
        policy: &AggregateFailoverPolicy,
        now: Instant,
    ) {
        if !policy.enabled {
            return;
        }
        let Some(member) = self.members.get_mut(&token.member_id) else {
            return;
        };
        if member.generation != token.generation || member.epoch != token.epoch {
            return;
        }
        member.finish(&token, outcome, policy, now);
        if matches!(outcome, MemberOutcome::Failure { .. }) {
            self.remove_failed_assignment(&token);
        }
    }

    fn retain(&mut self, member_ids: &[String], lease_id: u64, now: Instant) {
        let members = member_ids.iter().collect::<HashSet<_>>();
        self.members
            .retain(|member_id, _| members.contains(member_id));
        self.assignments.retain(|_, assignment| {
            members.contains(&assignment.member_id)
                && now.saturating_duration_since(assignment.last_used) < ASSIGNMENT_TTL
        });
        for member_id in member_ids {
            self.members
                .entry(member_id.clone())
                .or_insert_with(|| MemberRuntime {
                    generation: lease_id,
                    ..Default::default()
                });
        }
    }

    fn save_assignment(&mut self, session_id: String, assignment: Assignment) {
        if self.assignments.len() >= MAX_ASSIGNMENTS && !self.assignments.contains_key(&session_id)
        {
            if let Some(oldest) = self
                .assignments
                .iter()
                .min_by_key(|(_, assignment)| assignment.last_used)
                .map(|(id, _)| id.clone())
            {
                self.assignments.remove(&oldest);
            }
        }
        self.assignments.insert(session_id, assignment);
    }

    fn remove_failed_assignment(&mut self, token: &LeaseToken) {
        let Some(session_id) = &token.session_id else {
            return;
        };
        if self.assignments.get(session_id).is_some_and(|assignment| {
            assignment.member_id == token.member_id && assignment.lease_id == token.lease_id
        }) {
            self.assignments.remove(session_id);
        }
    }

    fn recovery_candidate(&self, options: &SelectionOptions<'_>, now: Instant) -> Option<String> {
        if !options.policy.enabled {
            return None;
        }
        options
            .member_ids
            .iter()
            .find(|id| {
                !options.excluded.contains(*id)
                    && self.members.get(*id).is_some_and(|member| {
                        member.probe_lease_id.is_none()
                            && member.retry_at.is_some_and(|retry_at| retry_at <= now)
                    })
            })
            .cloned()
    }

    fn routed_member(&mut self, options: &SelectionOptions<'_>, now: Instant) -> Option<String> {
        if options.policy.routing_strategy == AggregateRoutingStrategy::Balanced {
            return self
                .recovery_candidate(options, now)
                .or_else(|| self.least_loaded_member(options));
        }
        options
            .member_ids
            .iter()
            .find(|id| {
                !options.excluded.contains(*id)
                    && self.members.get(*id).is_some_and(|member| {
                        !options.policy.enabled
                            || (member.probe_lease_id.is_none()
                                && member.retry_at.is_none_or(|retry_at| retry_at <= now))
                    })
            })
            .cloned()
    }

    fn sticky_member(&self, options: &SelectionOptions<'_>) -> Option<String> {
        let assignment = self.assignments.get(usable_session(options.session_id)?)?;
        self.healthy_candidate(&assignment.member_id, options)
            .then(|| assignment.member_id.clone())
    }

    fn healthy_candidate(&self, member_id: &str, options: &SelectionOptions<'_>) -> bool {
        !options.excluded.contains(member_id)
            && self.members.get(member_id).is_some_and(|member| {
                !options.policy.enabled
                    || (member.retry_at.is_none() && member.probe_lease_id.is_none())
            })
    }

    fn least_loaded_member(&mut self, options: &SelectionOptions<'_>) -> Option<String> {
        let member_count = options.member_ids.len();
        let counts = self.assignment_counts(options.member_ids, None);
        let start = self.next_index % member_count.max(1);
        let (position, selected) = options
            .member_ids
            .iter()
            .enumerate()
            .filter(|(_, id)| self.healthy_candidate(id, options))
            .min_by_key(|(position, id)| {
                (
                    counts.get(*id).copied().unwrap_or_default(),
                    (position + member_count - start) % member_count,
                )
            })?;
        self.next_index = position.saturating_add(1);
        Some(selected.clone())
    }

    pub(super) fn assignment_counts(
        &self,
        member_ids: &[String],
        active_sessions: Option<&HashSet<String>>,
    ) -> HashMap<String, usize> {
        let mut counts = empty_assignment_counts(member_ids);
        for (session_id, assignment) in &self.assignments {
            if active_sessions.is_some_and(|sessions| !sessions.contains(session_id)) {
                continue;
            }
            if let Some(count) = counts.get_mut(&assignment.member_id) {
                *count = count.saturating_add(1);
            }
        }
        counts
    }
}

impl MemberRuntime {
    fn finish(
        &mut self,
        token: &LeaseToken,
        outcome: MemberOutcome,
        policy: &AggregateFailoverPolicy,
        now: Instant,
    ) {
        match outcome {
            MemberOutcome::Success => {
                self.record_outcome(false);
                // Concurrent successes still count toward error rate, but cannot clear a newer failure.
                if token.failure_version == self.failure_version {
                    self.succeed(policy, now);
                }
            }
            MemberOutcome::Failure { retry_after } => self.fail(policy, retry_after, now),
            MemberOutcome::Neutral if self.probe_lease_id == Some(token.lease_id) => {
                self.cool_down(policy, None, now);
            }
            _ => {}
        }
    }

    fn succeed(&mut self, policy: &AggregateFailoverPolicy, now: Instant) {
        if self.probe_lease_id.take().is_some() {
            self.recovery_successes = self.recovery_successes.saturating_add(1);
            self.epoch = self.epoch.saturating_add(1);
            if self.recovery_successes < policy.recovery_success_threshold {
                self.retry_at = Some(now);
                return;
            }
            self.outcomes.clear();
        }
        self.consecutive_failures = 0;
        self.recovery_successes = 0;
        self.retry_at = None;
    }

    fn record_outcome(&mut self, failed: bool) {
        self.outcomes.push_back(failed);
        if self.outcomes.len() > ERROR_RATE_WINDOW {
            self.outcomes.pop_front();
        }
    }

    fn error_rate_exceeded(&self, policy: &AggregateFailoverPolicy) -> bool {
        policy
            .error_rate_threshold_percent
            .is_some_and(|threshold| {
                self.outcomes.len() >= policy.error_rate_min_requests as usize
                    && self.outcomes.iter().filter(|failed| **failed).count() * 100
                        >= self.outcomes.len() * threshold as usize
            })
    }

    fn fail(
        &mut self,
        policy: &AggregateFailoverPolicy,
        retry_after: Option<Duration>,
        now: Instant,
    ) {
        self.consecutive_failures = self.consecutive_failures.saturating_add(1);
        self.record_outcome(true);
        self.failure_version = self.failure_version.saturating_add(1);
        let server_cooldown =
            policy.respect_retry_after && retry_after.is_some_and(|delay| !delay.is_zero());
        if self.consecutive_failures >= policy.failure_threshold
            || self.probe_lease_id.is_some()
            || server_cooldown
            || self.error_rate_exceeded(policy)
        {
            self.cool_down(policy, retry_after, now);
        }
    }

    fn cool_down(
        &mut self,
        policy: &AggregateFailoverPolicy,
        retry_after: Option<Duration>,
        now: Instant,
    ) {
        self.epoch = self.epoch.saturating_add(1);
        self.recovery_successes = 0;
        self.probe_lease_id = None;
        let exponent = self
            .consecutive_failures
            .saturating_sub(policy.failure_threshold)
            .min(63);
        let local_seconds = policy
            .initial_cooldown_seconds
            .saturating_mul(1_u64 << exponent)
            .min(policy.max_cooldown_seconds);
        let server_delay = retry_after
            .filter(|_| policy.respect_retry_after)
            .unwrap_or_default()
            .min(MAX_SERVER_RETRY_DELAY);
        self.retry_at = Some(now + Duration::from_secs(local_seconds).max(server_delay));
    }

    pub(super) fn snapshot(&self, now: Instant) -> MemberStateSnapshot {
        let retry_after = self
            .retry_at
            .map(|at| at.saturating_duration_since(now))
            .unwrap_or_default();
        let state = if self.probe_lease_id.is_some() || self.retry_at.is_some_and(|at| at <= now) {
            MemberState::Recovering
        } else if self.retry_at.is_some() {
            MemberState::CoolingDown
        } else {
            MemberState::Healthy
        };
        MemberStateSnapshot {
            state,
            consecutive_failures: self.consecutive_failures,
            retry_after_seconds: retry_after
                .as_secs()
                .saturating_add(u64::from(retry_after.subsec_nanos() != 0)),
        }
    }
}

fn usable_session(session_id: Option<&str>) -> Option<&str> {
    session_id.filter(|value| !value.trim().is_empty() && value.len() <= MAX_SESSION_ID_BYTES)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn assignment_cache_evicts_oldest_and_preserves_recent_conversations() {
        let mut runtime = AggregateRuntime::default();
        let now = Instant::now();
        for index in 0..MAX_ASSIGNMENTS {
            runtime.save_assignment(
                index.to_string(),
                Assignment {
                    member_id: "a".into(),
                    lease_id: index as u64,
                    last_used: now + Duration::from_secs(index as u64),
                },
            );
        }
        runtime.save_assignment(
            "new".into(),
            Assignment {
                member_id: "b".into(),
                lease_id: 20_000,
                last_used: now + ASSIGNMENT_TTL,
            },
        );
        assert_eq!(runtime.assignments.len(), MAX_ASSIGNMENTS);
        assert!(!runtime.assignments.contains_key("0"));
        assert!(runtime.assignments.contains_key("new"));
        assert!(runtime
            .assignments
            .contains_key(&(MAX_ASSIGNMENTS - 1).to_string()));
    }
}
