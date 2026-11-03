use super::*;

#[path = "maturity_tests.rs"]
mod maturity;

struct Scenario {
    scheduler: AggregateScheduler,
    policy: AggregateFailoverPolicy,
    members: Vec<String>,
    excluded: HashSet<String>,
    now: Instant,
}

impl Scenario {
    fn new() -> Self {
        Self {
            scheduler: AggregateScheduler::default(),
            policy: AggregateFailoverPolicy::default(),
            members: ["a", "b", "c"].map(str::to_string).to_vec(),
            excluded: HashSet::new(),
            now: Instant::now(),
        }
    }

    fn select(&mut self, session_id: &str) -> LeaseToken {
        self.scheduler
            .select_at(
                &SelectionOptions {
                    aggregate_id: "g",
                    session_id: Some(session_id),
                    member_ids: &self.members,
                    excluded: &self.excluded,
                    policy: &self.policy,
                },
                self.now,
            )
            .unwrap()
    }

    fn finish(&mut self, lease: LeaseToken, outcome: MemberOutcome) {
        self.scheduler
            .finish_at(lease, outcome, &self.policy, self.now);
    }

    fn fail(&mut self, lease: LeaseToken) {
        self.finish(lease, MemberOutcome::Failure { retry_after: None });
    }

    fn snapshot(&self, member_id: &str) -> MemberStateSnapshot {
        self.scheduler.groups["g"].members[member_id].snapshot(self.now)
    }

    fn open_first_member(&mut self) {
        self.policy.failure_threshold = 1;
        let first = self.select("one");
        assert_eq!(first.member_id, "a");
        self.fail(first);
    }
}

#[test]
fn balances_new_conversations_and_preserves_healthy_stickiness() {
    let mut scenario = Scenario::new();
    let selected =
        ["one", "two", "three", "four"].map(|session| scenario.select(session).member_id);
    assert_eq!(selected, ["a", "b", "c", "a"]);
    assert_eq!(scenario.select("two").member_id, "b");
    let active = HashSet::from(["one".to_string(), "three".to_string()]);
    assert_eq!(
        scenario.scheduler.groups["g"].assignment_counts(&scenario.members, Some(&active)),
        HashMap::from([
            ("a".to_string(), 1),
            ("b".to_string(), 0),
            ("c".to_string(), 1)
        ])
    );
}

#[test]
fn waits_for_threshold_then_backs_off_exponentially_and_recovers() {
    let mut scenario = Scenario::new();
    scenario.members = vec!["a".to_string()];
    scenario.policy.max_cooldown_seconds = 15;
    let first = scenario.select("one");
    scenario.fail(first);
    assert_eq!(scenario.snapshot("a").state, MemberState::Healthy);
    for seconds in [5, 10, 15, 15] {
        let request = scenario.select("one");
        scenario.fail(request);
        assert_eq!(scenario.snapshot("a").retry_after_seconds, seconds);
        scenario.now += Duration::from_secs(seconds);
    }
    let recovery = scenario.select("one");
    scenario.finish(recovery, MemberOutcome::Success);
    assert_eq!(scenario.snapshot("a").consecutive_failures, 0);
    assert_eq!(scenario.snapshot("a").state, MemberState::Healthy);
}

#[test]
fn one_recovery_probe_remains_exclusive_beyond_any_cooldown() {
    let mut scenario = Scenario::new();
    scenario.open_first_member();
    scenario.now += Duration::from_secs(5);
    let recovery = scenario.select("probe");
    assert_eq!(recovery.member_id, "a");
    assert_eq!(scenario.snapshot("a").state, MemberState::Recovering);
    scenario.now += Duration::from_secs(600);
    for index in 0..20 {
        let request = scenario.select(&format!("parallel-{index}"));
        assert_ne!(request.member_id, "a");
    }
    scenario.finish(recovery, MemberOutcome::Neutral);
    assert_eq!(scenario.snapshot("a").state, MemberState::CoolingDown);
    assert_eq!(scenario.snapshot("a").consecutive_failures, 1);
    scenario.now += Duration::from_secs(5);
    assert_eq!(scenario.select("next-probe").member_id, "a");
}

#[test]
fn recovery_probe_does_not_move_a_healthy_existing_conversation() {
    let mut scenario = Scenario::new();
    scenario.open_first_member();
    assert_eq!(scenario.select("healthy").member_id, "b");
    scenario.now += Duration::from_secs(5);
    assert_eq!(scenario.select("healthy").member_id, "b");
    assert_eq!(scenario.select("new").member_id, "a");
}

#[test]
fn late_success_cannot_erase_a_newer_failure_before_or_after_threshold() {
    let mut scenario = Scenario::new();
    let old = scenario.select("one");
    let newer = scenario.select("one");
    scenario.fail(newer);
    scenario.finish(old, MemberOutcome::Success);
    assert_eq!(scenario.snapshot("a").consecutive_failures, 1);
    scenario.excluded = HashSet::from(["b".to_string(), "c".to_string()]);
    let old = scenario.select("one");
    let newer = scenario.select("one");
    scenario.fail(newer);
    scenario.finish(old, MemberOutcome::Success);
    assert_eq!(scenario.snapshot("a").state, MemberState::CoolingDown);
    assert_eq!(scenario.snapshot("a").consecutive_failures, 2);
}

#[test]
fn late_failure_does_not_remove_a_newer_session_assignment() {
    let mut scenario = Scenario::new();
    let older = scenario.select("one");
    let newer = scenario.select("one");
    scenario.fail(older);
    let counts = scenario.scheduler.groups["g"].assignment_counts(&scenario.members, None);
    assert_eq!(counts["a"], 1);
    scenario.fail(newer);
    let counts = scenario.scheduler.groups["g"].assignment_counts(&scenario.members, None);
    assert_eq!(counts["a"], 0);
}

#[test]
fn stale_lease_after_reset_cannot_affect_new_runtime() {
    let mut scenario = Scenario::new();
    let older = scenario.select("one");
    scenario.scheduler.groups.clear();
    let newer = scenario.select("one");
    scenario.fail(older);
    assert_eq!(scenario.snapshot("a").consecutive_failures, 0);
    scenario.fail(newer);
    assert_eq!(scenario.snapshot("a").consecutive_failures, 1);
}

#[test]
fn removed_and_readded_members_are_isolated_from_old_leases() {
    let mut scenario = Scenario::new();
    let removed = scenario.select("one");
    scenario.members.retain(|id| id != "a");
    scenario.select("two");
    scenario.members.insert(0, "a".to_string());
    scenario.select("three");
    scenario.fail(removed);
    assert_eq!(scenario.snapshot("a").consecutive_failures, 0);
}

#[test]
fn disabled_policy_preserves_stickiness_and_does_not_record_failures() {
    let mut scenario = Scenario::new();
    scenario.policy.enabled = false;
    for _ in 0..20 {
        let request = scenario.select("one");
        assert_eq!(request.member_id, "a");
        scenario.fail(request);
    }
    assert_eq!(scenario.snapshot("a").consecutive_failures, 0);
    assert_eq!(scenario.snapshot("a").state, MemberState::Healthy);
}

#[test]
fn retry_after_can_exceed_local_backoff_and_apply_before_threshold() {
    let mut scenario = Scenario::new();
    let request = scenario.select("one");
    scenario.finish(
        request,
        MemberOutcome::Failure {
            retry_after: Some(Duration::from_secs(600)),
        },
    );
    assert_eq!(scenario.snapshot("a").retry_after_seconds, 600);
    assert_eq!(scenario.snapshot("a").consecutive_failures, 1);
    scenario.now += Duration::from_secs(600);
    let probe = scenario.select("new");
    assert_eq!(probe.member_id, "a");
    scenario.fail(probe);
    assert_eq!(scenario.snapshot("a").state, MemberState::CoolingDown);
}

#[test]
fn retry_after_is_bounded_and_can_be_disabled() {
    let mut scenario = Scenario::new();
    scenario.policy.failure_threshold = 1;
    let request = scenario.select("one");
    scenario.finish(
        request,
        MemberOutcome::Failure {
            retry_after: Some(Duration::MAX),
        },
    );
    assert_eq!(scenario.snapshot("a").retry_after_seconds, 86400);
    scenario.policy.respect_retry_after = false;
    let request = scenario.select("two");
    scenario.finish(
        request,
        MemberOutcome::Failure {
            retry_after: Some(Duration::from_secs(600)),
        },
    );
    assert_eq!(scenario.snapshot("b").retry_after_seconds, 5);
}

#[test]
fn expired_assignments_stop_biasing_load_and_oversized_sessions_are_not_retained() {
    let mut scenario = Scenario::new();
    scenario.select("one");
    scenario.select("two");
    scenario.now += Duration::from_secs(86400);
    scenario.select(&"x".repeat(1025));
    let counts = scenario.scheduler.groups["g"].assignment_counts(&scenario.members, None);
    assert!(counts.values().all(|count| *count == 0));
}

#[test]
fn unavailable_or_empty_groups_fail_without_dispatching_another_probe() {
    let mut scenario = Scenario::new();
    scenario.members = vec!["a".to_string()];
    scenario.open_first_member();
    let options = SelectionOptions {
        aggregate_id: "g",
        session_id: None,
        member_ids: &scenario.members,
        excluded: &scenario.excluded,
        policy: &scenario.policy,
    };
    assert!(scenario
        .scheduler
        .select_at(&options, scenario.now)
        .is_err());
    let options = SelectionOptions {
        member_ids: &[],
        ..options
    };
    assert!(scenario
        .scheduler
        .select_at(&options, scenario.now)
        .is_err());
}
