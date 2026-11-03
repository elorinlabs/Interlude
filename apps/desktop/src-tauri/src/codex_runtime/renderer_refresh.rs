//! Restore model caches and composer controls once a newly launched renderer is ready.

use std::time::{Duration, Instant};

use super::{ModelRefreshRequest, Ordering, CODEX_RUNTIME_APP, MODEL_REFRESH_GENERATION};

const RENDERER_READY_TIMEOUT: Duration = Duration::from_secs(30);
const RENDERER_RETRY_INTERVAL: Duration = Duration::from_millis(300);

/// Every managed launch, including recovery, needs the same refresh as an account switch.
pub(crate) fn refresh_after_launch() {
    if !crate::local_proxy::is_running() {
        return;
    }
    let Some(app) = CODEX_RUNTIME_APP.get().cloned() else {
        return;
    };
    // Resolving Provider settings and loading catalogs must not delay launch completion.
    if let Err(error) = std::thread::Builder::new()
        .name("codex-launch-refresh".to_string())
        .spawn(move || {
            if let Err(error) = refresh_current_target(&app) {
                eprintln!("Failed to prepare the Codex launch refresh: {error}");
            }
        })
    {
        eprintln!("Failed to start the Codex launch refresh: {error}");
    }
}

fn refresh_current_target(app: &tauri::AppHandle) -> Result<(), String> {
    // A switch may still be committing its target when launch completes. Read the
    // complete target before assigning a refresh generation, never an intermediate one.
    let _switch = crate::commands::account_switch_lock()
        .lock()
        .map_err(|_| "Account switch lock is unavailable.".to_string())?;
    let paths = crate::storage::resolve_paths(app)?;
    crate::providers::refresh_codex_models_for_current_target(&paths);
    Ok(())
}

trait RendererRefresh {
    fn is_current(&self) -> bool;
    fn elapsed(&self) -> Duration;
    fn wait(&mut self, duration: Duration);
    fn refresh(&mut self) -> Result<(), String>;
}

fn refresh_when_ready(refresh: &mut impl RendererRefresh) -> Result<(), String> {
    loop {
        if !refresh.is_current() {
            return Ok(());
        }
        let result = refresh.refresh();
        if !refresh.is_current() || result.is_ok() {
            return Ok(());
        }
        let remaining = RENDERER_READY_TIMEOUT.saturating_sub(refresh.elapsed());
        if remaining.is_zero() {
            return result;
        }
        refresh.wait(RENDERER_RETRY_INTERVAL.min(remaining));
    }
}

struct PendingRefresh<'a> {
    generation: u64,
    request: &'a ModelRefreshRequest,
    started: Instant,
}

impl RendererRefresh for PendingRefresh<'_> {
    fn is_current(&self) -> bool {
        MODEL_REFRESH_GENERATION.load(Ordering::Acquire) == self.generation
            && crate::client_integration::enabled_for(crate::local_proxy::is_running())
    }

    fn elapsed(&self) -> Duration {
        self.started.elapsed()
    }

    fn wait(&mut self, duration: Duration) {
        // The caller serializes refreshes on a worker; no UI thread waits here.
        std::thread::sleep(duration);
    }

    fn refresh(&mut self) -> Result<(), String> {
        let request = self.request;
        let result = crate::dream_skin_native::refresh_codex_models(request)?;
        // Ordinary launches deliberately have no renderer channel. Preserve their
        // immediate no-op instead of making blocking settings callers wait for CDP.
        if result.refreshed || result.reason.as_deref() == Some("runtime-not-initialized") {
            return Ok(());
        }
        Err(result
            .reason
            .unwrap_or_else(|| "renderer-not-ready".to_string()))
    }
}

pub(super) fn apply(generation: u64, request: &ModelRefreshRequest) {
    let mut refresh = PendingRefresh {
        generation,
        request,
        started: Instant::now(),
    };
    // Publishing a CDP target precedes both the React root and its query cache.
    // Retry the resolved catalog, without refetching it or restarting the application.
    if let Err(error) = refresh_when_ready(&mut refresh) {
        eprintln!("Codex model picker refresh failed: {error}");
    }
}

#[cfg(test)]
mod tests;
