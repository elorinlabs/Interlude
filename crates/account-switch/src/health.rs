//! Health labels are evidence-based. An expired access token with a refresh token is recoverable.
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Status {
    Available,
    Unchecked,
    RefreshNeeded,
    NeedsLogin,
    CheckFailed,
    Restricted,
    RateLimited,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Health {
    pub status: Status,
    pub checked_at: Option<i64>,
}

pub fn local(valid: bool, expires_at: Option<i64>, refreshable: bool, now: i64) -> Health {
    let status = if !valid {
        Status::NeedsLogin
    } else if expires_at.is_some_and(|expiry| expiry <= now + 60) {
        if refreshable {
            Status::RefreshNeeded
        } else {
            Status::NeedsLogin
        }
    } else {
        Status::Unchecked
    };
    Health {
        status,
        checked_at: None,
    }
}

pub fn http_status(code: u16) -> Status {
    match code {
        200..=299 => Status::Available,
        401 => Status::NeedsLogin,
        403 => Status::Restricted,
        429 => Status::RateLimited,
        _ => Status::CheckFailed,
    }
}

/// A cached result is a recent observation, not a permanent assertion of availability.
pub fn combine(local: Health, cached: Option<Health>, now: i64) -> Health {
    if matches!(local.status, Status::NeedsLogin | Status::RefreshNeeded) {
        return local;
    }
    cached
        .filter(|value| {
            value
                .checked_at
                .is_some_and(|time| time <= now && now - time < 900)
        })
        .unwrap_or(local)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn expiry_with_refresh_is_not_invalid_login() {
        assert_eq!(
            local(true, Some(10), true, 100).status,
            Status::RefreshNeeded
        );
        assert_eq!(local(true, Some(10), false, 100).status, Status::NeedsLogin);
    }
    #[test]
    fn valid_unverified_credentials_are_not_marked_available() {
        assert_eq!(local(true, Some(1000), true, 100).status, Status::Unchecked);
        assert_eq!(local(false, None, true, 100).status, Status::NeedsLogin);
    }
    #[test]
    fn protocol_statuses_remain_distinct() {
        for (code, expected) in [
            (200, Status::Available),
            (401, Status::NeedsLogin),
            (403, Status::Restricted),
            (429, Status::RateLimited),
            (503, Status::CheckFailed),
        ] {
            assert_eq!(http_status(code), expected);
        }
    }
    #[test]
    fn stale_future_or_missing_checks_do_not_assert_health() {
        for time in [None, Some(1), Some(2000)] {
            let cached = Health {
                status: Status::Available,
                checked_at: time,
            };
            assert_eq!(
                combine(local(true, Some(3000), true, 1000), Some(cached), 1000).status,
                Status::Unchecked
            );
        }
    }
}
