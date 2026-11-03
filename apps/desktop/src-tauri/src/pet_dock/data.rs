use chrono::{DateTime, Utc};
use serde_json::{json, Value};

use crate::models::{ProviderBalance, UsageSummary};
use rusqlite::{Connection, OpenFlags};
use tauri::Manager;

const STALE_SECONDS: i64 = 600;
const FIVE_HOUR_MINUTES: i64 = 300;
const WEEK_MINUTES: i64 = 10080;

pub(super) fn unavailable(kind: &str) -> Value {
    json!({ "kind": kind, "error": true, "stale": true })
}

pub(super) fn official(usage: &UsageSummary, now: i64) -> Value {
    let fetched_at = usage
        .fetched_at
        .as_deref()
        .and_then(|date| DateTime::parse_from_rfc3339(date).ok())
        .map(|date| date.timestamp());
    let mut stale = fetched_at.is_none_or(|time| now - time > STALE_SECONDS || time - now > 60);
    let mut window = |minutes| {
        let window = [usage.primary.as_ref(), usage.secondary.as_ref()]
            .into_iter()
            .flatten()
            .find(|window| window.window_minutes == Some(minutes))?;
        if !window.remaining_percent.is_finite()
            || !(0.0..=100.0).contains(&window.remaining_percent)
        {
            return None;
        }
        stale |= window.resets_at.is_some_and(|time| time <= now);
        Some(json!({ "remaining": window.remaining_percent }))
    };
    let five_hour = window(FIVE_HOUR_MINUTES);
    let weekly = window(WEEK_MINUTES);
    json!({ "kind": "official", "fiveHour": five_hour, "weekly": weekly,
        "stale": stale, "error": usage.error.is_some() })
}

pub(super) fn api(balance: Option<&ProviderBalance>, tokens: Option<u64>, failed: bool) -> Value {
    let remaining = balance.and_then(|balance| {
        let amount = balance
            .api_amount
            .filter(|amount| amount.is_finite())
            .map(|amount| (amount, &balance.api_unit))
            .or_else(|| {
                balance
                    .wallet_amount
                    .filter(|amount| amount.is_finite())
                    .map(|amount| (amount, &balance.wallet_unit))
            });
        if let Some((amount, unit)) = amount {
            return Some(json!({ "amount": amount.max(0.0), "unit": unit, "unlimited": false }));
        }
        (balance.api_unlimited && balance.wallet_error.is_none())
            .then(|| json!({ "unlimited": true }))
    });
    let stale = failed
        || balance
            .is_some_and(|balance| Utc::now().timestamp() - balance.queried_at > STALE_SECONDS);
    json!({ "kind": "api", "remaining": remaining, "totalTokens": tokens,
        "error": failed || balance.is_some_and(|value| value.wallet_error.is_some() && remaining.is_none()),
        "pending": balance.is_none() && !failed, "stale": stale })
}

pub(super) fn read_tokens(app: &tauri::AppHandle, id: &str, name: &str) -> Option<u64> {
    let path = app.path().app_data_dir().ok()?.join("token-usage.sqlite3");
    let connection = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY).ok()?;
    connection
        .busy_timeout(std::time::Duration::from_millis(200))
        .ok()?;
    provider_tokens(&connection, id, name).ok()
}

fn provider_tokens(connection: &Connection, id: &str, name: &str) -> rusqlite::Result<u64> {
    // Only read maintained lifetime totals; polling must not migrate or scan request history.
    let value: i64 = connection.query_row(
        "SELECT COALESCE(SUM(total_tokens), 0) FROM provider_token_usage_totals
         WHERE provider_id = ?1 OR (provider_id IS NULL AND lower(trim(provider)) = lower(trim(?2)))",
        rusqlite::params![id, name], |row| row.get(0),
    )?;
    Ok(value.max(0) as u64)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn quota_windows_are_identified_by_duration_and_expiry() {
        let now = 1_700_000_000;
        let usage: UsageSummary = serde_json::from_value(json!({
            "fetchedAt": "2023-11-14T22:13:20Z",
            "secondary": { "windowMinutes": 300, "remainingPercent": 81, "usedPercent": 19 },
            "primary": { "windowMinutes": 10080, "remainingPercent": 62, "usedPercent": 38,
                "resetsAt": now - 1 }
        }))
        .unwrap();
        let snapshot = official(&usage, now);
        assert_eq!(snapshot["fiveHour"]["remaining"], 81.0);
        assert_eq!(snapshot["weekly"]["remaining"], 62.0);
        assert_eq!(snapshot["stale"], true);
    }

    #[test]
    fn missing_windows_are_unknown_and_old_data_is_marked() {
        let snapshot = official(&UsageSummary::default(), Utc::now().timestamp());
        assert!(snapshot["fiveHour"].is_null());
        assert!(snapshot["weekly"].is_null());
        assert_eq!(snapshot["stale"], true);
    }

    #[test]
    fn unlimited_key_prefers_wallet_and_never_exposes_wallet_errors() {
        let mut balance = ProviderBalance {
            api_amount: None,
            api_unit: "USD".into(),
            api_unlimited: true,
            wallet_amount: Some(42.25),
            wallet_unit: "USD".into(),
            wallet_error: None,
            balance_items: vec![],
            queried_at: Utc::now().timestamp(),
        };
        assert_eq!(
            api(Some(&balance), Some(55910000), false)["remaining"]["amount"],
            42.25
        );
        balance.wallet_amount = None;
        assert_eq!(
            api(Some(&balance), None, false)["remaining"]["unlimited"],
            true
        );
        balance.wallet_error = Some("private service error".into());
        let snapshot = api(Some(&balance), None, false);
        assert!(snapshot["remaining"].is_null());
        assert!(!snapshot.to_string().contains("private service"));
    }

    #[test]
    fn token_totals_match_ids_and_only_fall_back_for_legacy_rows() {
        let db = Connection::open_in_memory().unwrap();
        db.execute_batch(
            "CREATE TABLE provider_token_usage_totals (
            provider_id TEXT, provider TEXT, total_tokens INTEGER);
            INSERT INTO provider_token_usage_totals VALUES ('a', 'Relay', 10),
            ('b', 'Relay', 50), (NULL, ' relay ', 20);",
        )
        .unwrap();
        assert_eq!(provider_tokens(&db, "a", "Relay").unwrap(), 30);
        assert_eq!(provider_tokens(&db, "missing", "Other").unwrap(), 0);
    }
}
