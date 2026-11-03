//! Deadlines for single-flight IPC batches, independent of socket reconnects.
use std::time::{Duration, Instant};

const ACK_TIMEOUT: Duration = Duration::from_secs(30);

#[derive(Default)]
pub(super) struct PendingAck(Option<Instant>);

impl PendingAck {
    pub fn sent(&mut self) {
        self.0.get_or_insert_with(Instant::now);
    }

    pub fn clear(&mut self) {
        self.0 = None;
    }

    pub fn pending(&self) -> bool {
        self.0.is_some()
    }

    pub fn expired(&self, now: Instant) -> bool {
        self.0
            .is_some_and(|sent| now.saturating_duration_since(sent) >= ACK_TIMEOUT)
    }
}
