//! Duplicate imports retain local metadata and must not roll back renewed credentials.
use serde_json::Value;

pub fn imported_auth_is_older(incoming: &Value, saved: &Value) -> bool {
    let refreshed = |auth: &Value| {
        auth.get("last_refresh")
            .and_then(Value::as_str)
            .and_then(|value| chrono::DateTime::parse_from_rfc3339(value).ok())
    };
    matches!((refreshed(incoming), refreshed(saved)), (Some(new), Some(old)) if new < old)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn compares_instants_and_keeps_explicit_undated_logins_importable() {
        let saved = json!({"last_refresh":"2026-11-01T01:00:00Z"});
        assert!(imported_auth_is_older(
            &json!({"last_refresh":"2026-10-31T23:00:00Z"}),
            &saved
        ));
        assert!(!imported_auth_is_older(
            &json!({"last_refresh":"2026-11-01T10:00:00+09:00"}),
            &saved
        ));
        assert!(!imported_auth_is_older(
            &json!({"last_refresh":"2026-11-01T02:00:00Z"}),
            &saved
        ));
        assert!(!imported_auth_is_older(&json!({}), &saved));
    }
}
