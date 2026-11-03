use std::collections::VecDeque;

use super::*;

#[derive(Default)]
struct SimulatedRenderer {
    elapsed: Duration,
    cancel_at: Option<Duration>,
    results: VecDeque<Result<(), String>>,
    attempts: usize,
    waits: Vec<Duration>,
}

impl RendererRefresh for SimulatedRenderer {
    fn is_current(&self) -> bool {
        self.cancel_at.is_none_or(|at| self.elapsed < at)
    }

    fn elapsed(&self) -> Duration {
        self.elapsed
    }

    fn wait(&mut self, duration: Duration) {
        self.elapsed += duration;
        self.waits.push(duration);
    }

    fn refresh(&mut self) -> Result<(), String> {
        self.attempts += 1;
        self.results
            .pop_front()
            .unwrap_or_else(|| Err("unavailable".into()))
    }
}

#[test]
fn retries_a_published_target_until_react_and_the_query_cache_are_ready() {
    let mut renderer = SimulatedRenderer {
        results: VecDeque::from([
            Err("The Codex main window is not available.".into()),
            Err("unavailable".into()),
            Err("query-client-not-found".into()),
            Ok(()),
        ]),
        ..Default::default()
    };
    refresh_when_ready(&mut renderer).unwrap();
    assert_eq!(renderer.attempts, 4);
    assert_eq!(renderer.waits, vec![RENDERER_RETRY_INTERVAL; 3]);
}

#[test]
fn a_ready_renderer_is_refreshed_once_without_waiting() {
    let mut renderer = SimulatedRenderer {
        results: VecDeque::from([Ok(())]),
        ..Default::default()
    };
    refresh_when_ready(&mut renderer).unwrap();
    assert_eq!(renderer.attempts, 1);
    assert!(renderer.waits.is_empty());
}

#[test]
fn a_new_account_refresh_cancels_the_pending_launch_refresh() {
    let mut renderer = SimulatedRenderer {
        cancel_at: Some(RENDERER_RETRY_INTERVAL),
        results: VecDeque::from([Err("query-client-not-found".into()), Ok(())]),
        ..Default::default()
    };
    refresh_when_ready(&mut renderer).unwrap();
    assert_eq!(renderer.attempts, 1);
    assert_eq!(renderer.results.len(), 1);
}

#[test]
fn a_replaced_refresh_never_touches_the_renderer() {
    let mut renderer = SimulatedRenderer {
        cancel_at: Some(Duration::ZERO),
        ..Default::default()
    };
    refresh_when_ready(&mut renderer).unwrap();
    assert_eq!(renderer.attempts, 0);
    assert!(renderer.waits.is_empty());
}

#[test]
fn an_unavailable_renderer_stops_retrying() {
    let mut renderer = SimulatedRenderer::default();
    assert_eq!(refresh_when_ready(&mut renderer), Err("unavailable".into()));
    assert_eq!(renderer.elapsed, RENDERER_READY_TIMEOUT);
    assert_eq!(renderer.attempts, renderer.waits.len() + 1);
}
