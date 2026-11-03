use chrono::{DateTime, Utc};

use super::QuotaAverage;
use crate::{
    models::{UsageSummary, UsageWindow},
    storage::Paths,
};

const FIVE_HOUR_MINUTES: i64 = 300;
const WEEK_MINUTES: i64 = 10080;
const STALE_SECONDS: i64 = 600;

/// Read only usage snapshots for every imported account, including disabled routing members.
pub(crate) fn load_average(paths: &Paths) -> Result<QuotaAverage, String> {
    read_average(&paths.accounts)
}

fn read_average(accounts: &std::path::Path) -> Result<QuotaAverage, String> {
    let entries = match std::fs::read_dir(accounts) {
        Ok(entries) => entries,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(QuotaAverage::default())
        }
        Err(_) => return Err("Could not read account quota snapshots".into()),
    };
    let mut usages = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|_| "Could not read account quota snapshots")?;
        let path = entry.path();
        if path.is_dir() && path.join("auth.json").is_file() {
            usages.push(crate::storage::load_usage(&path.join("usage.json")));
        }
    }
    Ok(calculate(&usages, Utc::now().timestamp()))
}

fn window(usage: &UsageSummary, minutes: i64) -> Option<&UsageWindow> {
    [usage.primary.as_ref(), usage.secondary.as_ref()]
        .into_iter()
        .flatten()
        .find(|value| {
            value.window_minutes == Some(minutes)
                && value.remaining_percent.is_finite()
                && (0.0..=100.0).contains(&value.remaining_percent)
        })
}

fn mean_window(usages: &[UsageSummary], minutes: i64) -> (Option<UsageWindow>, usize) {
    let values: Vec<_> = usages
        .iter()
        .filter_map(|usage| window(usage, minutes))
        .collect();
    let count = values.len();
    if count == 0 {
        return (None, 0);
    }
    let remaining = values
        .iter()
        .map(|value| value.remaining_percent)
        .sum::<f64>()
        / count as f64;
    (
        Some(UsageWindow {
            remaining_percent: remaining,
            used_percent: 100.0 - remaining,
            // Different accounts do not share a reset time.
            resets_at: None,
            window_minutes: Some(minutes),
        }),
        count,
    )
}

fn is_stale(usage: &UsageSummary, now: i64) -> bool {
    let fetched = usage
        .fetched_at
        .as_deref()
        .and_then(|value| DateTime::parse_from_rfc3339(value).ok());
    usage.error.is_some()
        || fetched.is_none_or(|time| {
            now - time.timestamp() > STALE_SECONDS || time.timestamp() > now + 60
        })
        || [FIVE_HOUR_MINUTES, WEEK_MINUTES]
            .into_iter()
            .any(|minutes| {
                window(usage, minutes)
                    .is_some_and(|value| value.resets_at.is_some_and(|time| time <= now))
            })
}

fn calculate(usages: &[UsageSummary], now: i64) -> QuotaAverage {
    let (primary, primary_accounts) = mean_window(usages, FIVE_HOUR_MINUTES);
    let (secondary, secondary_accounts) = mean_window(usages, WEEK_MINUTES);
    QuotaAverage {
        usage: UsageSummary {
            primary,
            secondary,
            ..Default::default()
        },
        total_accounts: usages.len(),
        primary_accounts,
        secondary_accounts,
        stale: usages.iter().any(|usage| is_stale(usage, now)),
    }
}

#[cfg(test)]
#[path = "tests.rs"]
mod tests;
