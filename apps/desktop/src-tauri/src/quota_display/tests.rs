use super::*;
use serde_json::json;

fn usage(primary: f64, secondary: f64) -> UsageSummary {
    serde_json::from_value(json!({
        "fetchedAt":"2026-10-27T06:00:00Z",
        "primary":{"remainingPercent":primary,"usedPercent":100.0-primary,"windowMinutes":300},
        "secondary":{"remainingPercent":secondary,"usedPercent":100.0-secondary,"windowMinutes":10080}
    })).unwrap()
}

const NOW: i64 = 1793080800;

#[test]
fn all_accounts_are_equal_and_zero_is_included() {
    let result = calculate(
        &[usage(82.0, 78.0), usage(75.0, 75.0), usage(50.0, 72.0)],
        NOW,
    );
    assert_eq!(result.usage.primary.unwrap().remaining_percent, 69.0);
    assert_eq!(result.usage.secondary.unwrap().remaining_percent, 75.0);
    let zero = calculate(&[usage(0.0, 0.0), usage(100.0, 100.0)], NOW);
    assert_eq!(zero.usage.primary.unwrap().remaining_percent, 50.0);
    assert_eq!(zero.primary_accounts, 2);
}

#[test]
fn reversed_and_missing_windows_have_independent_denominators() {
    let mut reversed = usage(20.0, 80.0);
    std::mem::swap(&mut reversed.primary, &mut reversed.secondary);
    let mut single = usage(60.0, 40.0);
    single.secondary = None;
    let result = calculate(&[reversed, single, UsageSummary::default()], NOW);
    assert_eq!(result.usage.primary.unwrap().remaining_percent, 40.0);
    assert_eq!(result.usage.secondary.unwrap().remaining_percent, 80.0);
    assert_eq!(
        (
            result.total_accounts,
            result.primary_accounts,
            result.secondary_accounts
        ),
        (3, 2, 1)
    );
}

#[test]
fn invalid_values_are_unknown_without_fabricating_reset_times() {
    let mut invalid = usage(50.0, 80.0);
    invalid.primary.as_mut().unwrap().remaining_percent = f64::NAN;
    invalid.secondary.as_mut().unwrap().remaining_percent = 101.0;
    let result = calculate(&[invalid, usage(12.5, 55.5)], NOW);
    assert_eq!(result.primary_accounts, 1);
    let primary = result.usage.primary.unwrap();
    assert_eq!(primary.remaining_percent, 12.5);
    assert_eq!(primary.resets_at, None);
    assert!(calculate(&[], NOW).usage.primary.is_none());
}

#[test]
fn cached_values_keep_staleness_and_expiry_visible() {
    let mut valid = usage(20.0, 30.0);
    let timestamp = DateTime::parse_from_rfc3339(valid.fetched_at.as_ref().unwrap())
        .unwrap()
        .timestamp();
    assert!(!calculate(&[valid.clone()], timestamp).stale);
    assert!(calculate(&[valid.clone()], timestamp + STALE_SECONDS + 1).stale);
    valid.primary.as_mut().unwrap().resets_at = Some(timestamp);
    assert!(calculate(&[valid], timestamp).stale);
}

#[test]
fn snapshots_include_disabled_accounts_and_ignore_orphan_directories() {
    let temporary = tempfile::tempdir().unwrap();
    for (name, remaining) in [("active", 80.0), ("disabled", 20.0), ("orphan", 100.0)] {
        let directory = temporary.path().join(name);
        std::fs::create_dir_all(&directory).unwrap();
        if name != "orphan" {
            std::fs::write(directory.join("auth.json"), "{}").unwrap();
        }
        crate::storage::save_usage(&directory.join("usage.json"), &usage(remaining, remaining))
            .unwrap();
    }
    let result = read_average(temporary.path()).unwrap();
    assert_eq!(result.total_accounts, 2);
    assert_eq!(result.usage.primary.unwrap().remaining_percent, 50.0);
    assert_eq!(
        read_average(&temporary.path().join("missing"))
            .unwrap()
            .total_accounts,
        0
    );
}
