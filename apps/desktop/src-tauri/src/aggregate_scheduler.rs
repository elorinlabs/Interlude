#[cfg(test)]
mod lease_tests;
mod runtime;
#[cfg(test)]
mod tests;

use std::{
    collections::{HashMap, HashSet},
    sync::{Mutex, OnceLock},
    time::{Duration, Instant},
};

use serde::Serialize;

use crate::aggregate_failover::AggregateFailoverPolicy;
use runtime::{AggregateRuntime, LeaseToken};

static SCHEDULER: OnceLock<Mutex<AggregateScheduler>> = OnceLock::new();

#[derive(Default)]
struct AggregateScheduler {
    groups: HashMap<String, AggregateRuntime>,
    next_lease_id: u64,
}

pub(crate) struct SelectionOptions<'a> {
    pub(crate) aggregate_id: &'a str,
    pub(crate) session_id: Option<&'a str>,
    pub(crate) member_ids: &'a [String],
    pub(crate) excluded: &'a HashSet<String>,
    pub(crate) policy: &'a AggregateFailoverPolicy,
}

/// A recovery request reserves its member until it completes or this lease is dropped.
pub(crate) struct MemberLease {
    token: Option<LeaseToken>,
    policy: AggregateFailoverPolicy,
}

#[derive(Clone, Copy, Debug)]
pub(crate) enum MemberOutcome {
    Success,
    Failure { retry_after: Option<Duration> },
    Neutral,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum MemberState {
    Healthy,
    CoolingDown,
    Recovering,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MemberStateSnapshot {
    pub(crate) state: MemberState,
    pub(crate) consecutive_failures: u32,
    pub(crate) retry_after_seconds: u64,
}

impl MemberLease {
    pub(crate) fn member_id(&self) -> &str {
        // The token is consumed only when finish takes ownership of this lease.
        self.token
            .as_ref()
            .map_or("", |token| token.member_id.as_str())
    }

    pub(crate) fn finish(mut self, outcome: MemberOutcome) {
        self.complete(outcome);
    }

    fn complete(&mut self, outcome: MemberOutcome) {
        let Some(token) = self.token.take() else {
            return;
        };
        if with_scheduler(|scheduler| {
            scheduler.finish_at(token, outcome, &self.policy, Instant::now());
            Ok(())
        })
        .is_err()
        {
            eprintln!("Aggregate API scheduler could not release a request lease");
        }
    }
}

impl Drop for MemberLease {
    fn drop(&mut self) {
        self.complete(MemberOutcome::Neutral);
    }
}

pub(crate) fn select_member(options: SelectionOptions<'_>) -> Result<MemberLease, String> {
    options
        .policy
        .validate()
        .map_err(|error| error.to_string())?;
    let token = with_scheduler(|scheduler| scheduler.select_at(&options, Instant::now()))?;
    Ok(MemberLease {
        token: Some(token),
        policy: options.policy.clone(),
    })
}

pub(crate) fn member_states(
    aggregate_id: &str,
    member_ids: &[String],
) -> Result<HashMap<String, MemberStateSnapshot>, String> {
    with_scheduler(|scheduler| {
        let now = Instant::now();
        let group = scheduler.groups.get(aggregate_id);
        Ok(member_ids
            .iter()
            .map(|id| {
                let snapshot = group
                    .and_then(|group| group.members.get(id))
                    .map(|member| member.snapshot(now))
                    .unwrap_or(MemberStateSnapshot {
                        state: MemberState::Healthy,
                        consecutive_failures: 0,
                        retry_after_seconds: 0,
                    });
                (id.clone(), snapshot)
            })
            .collect())
    })
}

pub(crate) fn conversation_counts(
    aggregate_id: &str,
    member_ids: &[String],
    active_session_ids: &HashSet<String>,
) -> Result<HashMap<String, usize>, String> {
    with_scheduler(|scheduler| {
        Ok(scheduler
            .groups
            .get(aggregate_id)
            .map(|runtime| runtime.assignment_counts(member_ids, Some(active_session_ids)))
            .unwrap_or_else(|| empty_assignment_counts(member_ids)))
    })
}

pub(crate) fn reset(aggregate_id: &str) {
    if with_scheduler(|scheduler| {
        scheduler.groups.remove(aggregate_id);
        Ok(())
    })
    .is_err()
    {
        eprintln!("Aggregate API scheduler could not reset its state");
    }
}

pub(crate) fn clear() {
    if with_scheduler(|scheduler| {
        scheduler.groups.clear();
        Ok(())
    })
    .is_err()
    {
        eprintln!("Aggregate API scheduler could not clear its state");
    }
}

fn with_scheduler<T>(
    operation: impl FnOnce(&mut AggregateScheduler) -> Result<T, String>,
) -> Result<T, String> {
    let mut scheduler = SCHEDULER
        .get_or_init(|| Mutex::new(AggregateScheduler::default()))
        .lock()
        .map_err(|_| "Aggregate API scheduler lock is poisoned".to_string())?;
    operation(&mut scheduler)
}

impl AggregateScheduler {
    fn select_at(
        &mut self,
        options: &SelectionOptions<'_>,
        now: Instant,
    ) -> Result<LeaseToken, String> {
        self.next_lease_id = self
            .next_lease_id
            .checked_add(1)
            .ok_or_else(|| "Aggregate API scheduler request limit reached".to_string())?;
        let runtime = self
            .groups
            .entry(options.aggregate_id.to_string())
            .or_default();
        runtime.select(options, self.next_lease_id, now)
    }

    fn finish_at(
        &mut self,
        token: LeaseToken,
        outcome: MemberOutcome,
        policy: &AggregateFailoverPolicy,
        now: Instant,
    ) {
        if let Some(runtime) = self.groups.get_mut(&token.aggregate_id) {
            runtime.finish(token, outcome, policy, now);
        }
    }
}

fn empty_assignment_counts(member_ids: &[String]) -> HashMap<String, usize> {
    member_ids.iter().map(|id| (id.clone(), 0)).collect()
}
