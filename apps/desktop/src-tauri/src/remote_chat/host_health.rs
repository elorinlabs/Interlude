//! Recover failed IPC independently of renderer heartbeats and established mobile sessions.
use super::renderer_recovery::RecoveryAttempt;
use serde::Serialize;
use std::{
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc,
    },
    time::{Duration, Instant},
};
use tauri::{AppHandle, Manager, Webview};

const STALE_SECONDS: u64 = 60;
#[derive(Default)]
pub(super) struct Health {
    started: std::sync::OnceLock<Instant>,
    active: AtomicBool,
    heartbeat: AtomicU64,
    restart_required: AtomicBool,
    renderer: AtomicU64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct HostHealthStatus {
    restart_required: bool,
}

impl Health {
    fn now(&self) -> u64 {
        self.started.get_or_init(Instant::now).elapsed().as_secs()
    }
    fn stale(&self) -> bool {
        (self.active.load(Ordering::Relaxed) || self.restart_required.load(Ordering::Relaxed))
            && self
                .now()
                .saturating_sub(self.heartbeat.load(Ordering::Relaxed))
                >= STALE_SECONDS
    }

    pub fn transport_failed(&self) {
        self.restart_required.store(true, Ordering::Relaxed);
    }

    pub fn attached(&self) {
        self.restart_required.store(false, Ordering::Relaxed);
    }

    pub fn needs_restart(&self) -> bool {
        self.restart_required.load(Ordering::Relaxed)
    }

    fn heartbeat(&self, active: bool) -> HostHealthStatus {
        self.heartbeat.store(self.now(), Ordering::Relaxed);
        self.active.store(active, Ordering::Relaxed);
        HostHealthStatus {
            restart_required: self.needs_restart(),
        }
    }
}

pub(super) fn start<R: tauri::Runtime>(app: AppHandle<R>) -> Arc<Health> {
    let health = Arc::new(Health::default());
    app.manage(Arc::clone(&health));
    tauri::async_runtime::spawn(watch(app));
    health
}

#[tauri::command]
pub(crate) async fn remote_chat_host_alive(
    app: AppHandle,
    window: Webview,
    active: bool,
    renderer_id: u64,
) -> Result<HostHealthStatus, String> {
    if window.label() != "main" {
        return Err("请在主窗口连接手机聊天。".into());
    }
    let state = app
        .try_state::<Arc<Health>>()
        .ok_or_else(|| "暂时无法检查连接状态，请稍后重试。".to_string())?;
    if renderer_id == 0 || renderer_id > u32::MAX as u64 {
        return Err("暂时无法检查连接状态，请稍后重试。".into());
    }
    state.renderer.store(renderer_id, Ordering::Release);
    Ok(state.heartbeat(active))
}

async fn watch<R: tauri::Runtime>(app: AppHandle<R>) {
    let mut interval = tokio::time::interval(Duration::from_secs(10));
    let mut pending: Option<RecoveryAttempt> = None;
    loop {
        interval.tick().await;
        let state = app.state::<Arc<Health>>();
        if let Some(attempt) = pending.as_mut() {
            if attempt.completed(state.renderer.load(Ordering::Acquire)) {
                attempt.progress.cancelled.store(true, Ordering::Release);
                record_recovery("confirmed", &state, attempt.started_at);
                pending = None;
            } else if let Some(stage) = attempt.diagnostic(state.now()) {
                record_recovery(stage, &state, attempt.started_at);
            }
            // Keep a failed attempt latched until a new page responds; never queue repeated reloads.
            continue;
        }
        if !state.stale() {
            continue;
        }
        let attempt = RecoveryAttempt::new(state.now(), state.renderer.load(Ordering::Acquire));
        record_recovery("queued", &state, attempt.started_at);
        queue_reload(&app, &attempt);
        pending = Some(attempt);
    }
}

fn queue_reload<R: tauri::Runtime>(app: &AppHandle<R>, attempt: &RecoveryAttempt) {
    let handle = app.clone();
    let progress = Arc::clone(&attempt.progress);
    let queued = app.run_on_main_thread(move || {
        if progress.cancelled.load(Ordering::Acquire) {
            return;
        }
        progress.entered.store(true, Ordering::Release);
        let succeeded = handle
            .get_webview("main")
            .is_some_and(|window| window.reload().is_ok());
        progress.reloaded.store(succeeded, Ordering::Release);
        progress.failed.store(!succeeded, Ordering::Release);
    });
    if queued.is_err() {
        attempt.progress.failed.store(true, Ordering::Release);
    }
}

fn record_recovery(stage: &str, health: &Health, started_at: u64) {
    // The bounded log worker persists numeric evidence even when the UI cannot execute a callback.
    crate::error_logs::record_codex_error(&format!(
        "remote chat renderer recovery: stage={stage}, elapsed_s={}, heartbeat_age_s={}, active={}, transport_failed={}",
        health.now().saturating_sub(started_at),
        health.now().saturating_sub(health.heartbeat.load(Ordering::Relaxed)),
        health.active.load(Ordering::Relaxed),
        health.needs_restart(),
    ));
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn only_recovers_an_active_chat_with_a_stale_host() {
        let health = Health::default();
        health
            .started
            .set(Instant::now() - Duration::from_secs(61))
            .unwrap();
        assert!(!health.stale());
        health.active.store(true, Ordering::Relaxed);
        assert!(health.stale());
        health.heartbeat.store(health.now(), Ordering::Relaxed);
        assert!(!health.stale());
    }

    #[test]
    fn a_responsive_renderer_still_rebuilds_a_stalled_transport_before_pairing() {
        let health = Health::default();
        assert!(!health.heartbeat(false).restart_required);
        health.transport_failed();
        assert!(health.heartbeat(false).restart_required);
        assert!(health.heartbeat(false).restart_required);
        assert!(!health.stale());
        health.attached();
        assert!(!health.heartbeat(false).restart_required);
    }

    #[test]
    fn a_frozen_renderer_is_recoverable_without_an_established_mobile_session() {
        let health = Health::default();
        health
            .started
            .set(Instant::now() - Duration::from_secs(61))
            .unwrap();
        assert!(!health.stale());
        health.transport_failed();
        assert!(health.stale());
        health.heartbeat(false);
        assert!(!health.stale());
    }
}
