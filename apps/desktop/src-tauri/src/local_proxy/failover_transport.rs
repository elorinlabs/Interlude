//! Preserve transport replay safety while legacy forwarding APIs return strings.

use super::upstream_transport::{Error, Phase};
use std::{
    cell::RefCell,
    time::{Duration, SystemTime},
};

const MAX_RETRY_AFTER: Duration = Duration::from_secs(24 * 60 * 60);

/// A network failure may affect provider health without permitting request replay.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(super) struct NetworkFailure {
    pub(super) replay_safe: bool,
}

thread_local! {
    // The outer option distinguishes an active capture from unrelated HTTP operations.
    static CURRENT: RefCell<Option<Option<NetworkFailure>>> = const { RefCell::new(None) };
}

struct CaptureScope {
    previous: Option<Option<NetworkFailure>>,
}

impl CaptureScope {
    fn enter() -> Self {
        Self {
            previous: CURRENT.with(|current| current.replace(Some(None))),
        }
    }
}

impl Drop for CaptureScope {
    fn drop(&mut self) {
        CURRENT.with(|current| *current.borrow_mut() = self.previous);
    }
}

/// Run on a synchronous proxy worker; nested captures cannot change the outer result.
pub(super) fn capture<T>(
    operation: impl FnOnce() -> Result<T, String>,
) -> (Result<T, String>, Option<NetworkFailure>) {
    let _scope = CaptureScope::enter();
    let result = operation();
    // A protocol fallback can return an earlier HTTP response after a later send fails.
    // Only a successful transport send, rather than the enclosing result, clears safety evidence.
    let failure = CURRENT.with(|current| current.borrow().flatten());
    (result, failure)
}

pub(super) fn record(error: Option<&Error>) {
    CURRENT.with(|current| {
        if let Some(failure) = current.borrow_mut().as_mut() {
            *failure = error.and_then(classify);
        }
    });
}

fn classify(error: &Error) -> Option<NetworkFailure> {
    let replay_safe = match error {
        Error::Http { source, sent_bytes } if !source.is_builder() => {
            source.is_connect() && *sent_bytes == 0
        }
        Error::Timeout { phase, sent_bytes } => matches!(phase, Phase::Upload) && *sent_bytes == 0,
        Error::AfterRedirect(source) => {
            return classify(source).map(|_| NetworkFailure { replay_safe: false })
        }
        Error::Http { .. }
        | Error::UnbufferedBody
        | Error::RedirectLimit(_)
        | Error::RedirectScheme
        | Error::Proxy(_) => {
            return None;
        }
    };
    Some(NetworkFailure { replay_safe })
}

/// Honor a bounded server cooldown; invalid or expired dates do not set a deadline.
pub(super) fn retry_after(headers: &[(String, String)], now: SystemTime) -> Option<Duration> {
    let value = headers
        .iter()
        .find(|(name, _)| name.eq_ignore_ascii_case("retry-after"))?
        .1
        .trim();
    if !value.is_empty() && value.bytes().all(|byte| byte.is_ascii_digit()) {
        return value
            .parse::<u64>()
            .ok()
            .map(|seconds| Duration::from_secs(seconds).min(MAX_RETRY_AFTER));
    }
    let date = chrono::DateTime::parse_from_rfc2822(value).ok()?;
    let delay = SystemTime::from(date).duration_since(now).ok()?;
    (!delay.is_zero()).then_some(delay.min(MAX_RETRY_AFTER))
}

#[cfg(test)]
#[path = "failover_transport/tests.rs"]
mod tests;
