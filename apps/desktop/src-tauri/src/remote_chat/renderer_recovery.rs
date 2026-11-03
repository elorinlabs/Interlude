//! A queued UI callback is not evidence that a renderer recovered.
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};

pub(super) const RECOVERY_TIMEOUT_SECONDS: u64 = 30;

#[derive(Default)]
pub(super) struct ReloadProgress {
    pub entered: AtomicBool,
    pub reloaded: AtomicBool,
    pub failed: AtomicBool,
    pub cancelled: AtomicBool,
}

pub(super) struct RecoveryAttempt {
    pub progress: Arc<ReloadProgress>,
    pub started_at: u64,
    renderer: u64,
    reported: bool,
}

impl RecoveryAttempt {
    pub fn new(now: u64, renderer: u64) -> Self {
        Self {
            progress: Arc::default(),
            started_at: now,
            renderer,
            reported: false,
        }
    }

    pub fn completed(&self, renderer: u64) -> bool {
        // A new page must complete IPC; late heartbeats from the old page cannot confirm recovery.
        renderer != 0 && renderer != self.renderer
    }

    pub fn diagnostic(&mut self, now: u64) -> Option<&'static str> {
        if self.reported {
            return None;
        }
        let failed = self.progress.failed.load(Ordering::Acquire);
        if !failed && now.saturating_sub(self.started_at) < RECOVERY_TIMEOUT_SECONDS {
            return None;
        }
        self.reported = true;
        self.progress.cancelled.store(true, Ordering::Release);
        Some(if failed {
            "reload_failed"
        } else if !self.progress.entered.load(Ordering::Acquire) {
            "main_thread_timeout"
        } else if !self.progress.reloaded.load(Ordering::Acquire) {
            "reload_call_timeout"
        } else {
            "renderer_confirmation_timeout"
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_a_new_renderer_confirms_recovery() {
        let attempt = RecoveryAttempt::new(100, 7);
        assert!(!attempt.completed(0));
        assert!(!attempt.completed(7));
        attempt.progress.reloaded.store(true, Ordering::Release);
        assert!(!attempt.completed(7));
        assert!(attempt.completed(8));
    }

    #[test]
    fn a_blocked_main_thread_is_reported_once_and_its_late_callback_is_cancelled() {
        let mut attempt = RecoveryAttempt::new(100, 7);
        assert_eq!(attempt.diagnostic(129), None);
        assert_eq!(attempt.diagnostic(130), Some("main_thread_timeout"));
        assert!(attempt.progress.cancelled.load(Ordering::Acquire));
        assert_eq!(attempt.diagnostic(300), None);
        assert!(attempt.completed(8));
    }

    #[test]
    fn distinguishes_reload_failure_from_a_missing_renderer_confirmation() {
        let mut attempt = RecoveryAttempt::new(100, 7);
        attempt.progress.entered.store(true, Ordering::Release);
        assert_eq!(attempt.diagnostic(130), Some("reload_call_timeout"));
        let mut attempt = RecoveryAttempt::new(100, 7);
        attempt.progress.reloaded.store(true, Ordering::Release);
        attempt.progress.entered.store(true, Ordering::Release);
        assert_eq!(
            attempt.diagnostic(130),
            Some("renderer_confirmation_timeout")
        );
        let mut attempt = RecoveryAttempt::new(100, 7);
        attempt.progress.failed.store(true, Ordering::Release);
        assert_eq!(attempt.diagnostic(101), Some("reload_failed"));
    }
}
