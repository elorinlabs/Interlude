//! Official discovery has its own budget; Admin fallback starts a separate sixty-second request.
use std::{cell::Cell, time::Duration};
use tokio::time::Instant;

const OFFICIAL_TIMEOUT: Duration = Duration::from_secs(60);
const CREDENTIAL_TIMEOUT: Duration = Duration::from_secs(3);

thread_local! {
    static DEADLINE: Cell<Option<Instant>> = const { Cell::new(None) };
}

pub(super) struct Scope(Option<Instant>);

impl Scope {
    pub(super) fn enter() -> Self {
        Self::until(Instant::now() + OFFICIAL_TIMEOUT)
    }

    pub(super) fn until(deadline: Instant) -> Self {
        Self(DEADLINE.replace(Some(deadline)))
    }
}

impl Drop for Scope {
    fn drop(&mut self) {
        DEADLINE.set(self.0);
    }
}

pub(super) fn current() -> Option<Instant> {
    DEADLINE.get()
}

#[derive(Debug, thiserror::Error)]
#[error("Model catalog request timed out")]
pub(super) struct Expired;

pub(super) fn credential_timeout(default: Duration) -> Result<Duration, Expired> {
    let Some(deadline) = current() else {
        return Ok(default);
    };
    let remaining = deadline.saturating_duration_since(Instant::now());
    if remaining.is_zero() {
        return Err(Expired);
    }
    Ok(remaining.min(CREDENTIAL_TIMEOUT))
}
