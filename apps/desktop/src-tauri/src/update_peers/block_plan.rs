use super::snapshot::{BLOCK_BYTES, MAX_REQUESTS};
use std::time::Duration;
use tokio::time::Instant;

const STEAL_DELAY: Duration = Duration::from_secs(2);

/// Tracks ownership separately from completion so a disappearing source releases only unfinished work.
pub(super) struct Plan {
    pub size: usize,
    pub done: Vec<bool>,
    pub busy: Vec<Vec<(usize, Instant)>>,
    pub completed: usize,
}

impl Plan {
    pub fn new(size: usize, sources: usize) -> Self {
        Self {
            size,
            done: vec![false; size.div_ceil(BLOCK_BYTES)],
            busy: vec![Vec::new(); sources],
            completed: 0,
        }
    }

    pub fn claim(&mut self, source: usize, window: usize, reverse: bool) -> Vec<usize> {
        if !self.busy[source].is_empty() {
            return Vec::new();
        }
        let mut selected = Vec::new();
        for _ in 0..window.clamp(1, MAX_REQUESTS) {
            let Some(index) = self.next(source, reverse) else {
                break;
            };
            self.busy[source].push((index, Instant::now()));
            selected.push(index);
        }
        selected
    }

    fn next(&self, source: usize, reverse: bool) -> Option<usize> {
        let free = |index: &usize| {
            !self.done[*index] && !self.busy.iter().flatten().any(|(busy, _)| busy == index)
        };
        let pending = if reverse {
            (0..self.done.len()).rev().find(free)
        } else {
            (0..self.done.len()).find(free)
        };
        pending.or_else(|| {
            self.busy
                .iter()
                .flatten()
                .find(|(index, started)| {
                    !self.done[*index]
                        && started.elapsed() >= STEAL_DELAY
                        && !self.busy[source].iter().any(|(own, _)| own == index)
                        && self
                            .busy
                            .iter()
                            .flatten()
                            .filter(|(busy, _)| busy == index)
                            .count()
                            == 1
                })
                .map(|(index, _)| *index)
        })
    }

    pub fn finish(&mut self, source: usize, index: usize) -> bool {
        self.busy[source].retain(|(busy, _)| *busy != index);
        if self.done[index] {
            return false;
        }
        self.done[index] = true;
        self.completed += 1;
        true
    }

    pub fn length(&self, index: usize) -> usize {
        BLOCK_BYTES.min(self.size - index * BLOCK_BYTES)
    }
}

pub(super) fn request_window(bytes: usize, elapsed: Duration, maximum: usize) -> usize {
    let blocks =
        (bytes as f64 / elapsed.as_secs_f64().max(0.001) / BLOCK_BYTES as f64).ceil() as usize;
    blocks.clamp(2.min(maximum), maximum)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn pipeline_reserves_distinct_work_and_recovers_a_partial_batch() {
        let mut plan = Plan::new(BLOCK_BYTES * 8, 3);
        assert_eq!(plan.claim(0, 3, true), vec![7, 6, 5]);
        assert_eq!(plan.claim(1, 2, true), vec![4, 3]);
        assert_eq!(plan.claim(2, 1, false), vec![0]);
        assert!(plan.finish(0, 7));
        plan.busy[0].clear();
        assert!(plan.finish(1, 4));
        assert!(plan.finish(1, 3));
        assert_eq!(plan.claim(1, 3, true), vec![6, 5, 2]);
        assert!(plan.done[7]);
    }
    #[test]
    fn endgame_never_requests_a_third_copy_or_duplicates_its_own_queue() {
        let mut plan = Plan::new(BLOCK_BYTES, 3);
        plan.busy[0].push((0, Instant::now() - STEAL_DELAY));
        assert_eq!(plan.claim(1, 8, true), vec![0]);
        assert!(plan.claim(2, 8, true).is_empty());
        assert!(plan.finish(1, 0));
        assert!(!plan.finish(0, 0));
        assert_eq!(plan.completed, 1);
    }
    #[test]
    fn queue_adapts_to_throughput_but_respects_legacy_and_memory_limits() {
        assert_eq!(
            request_window(BLOCK_BYTES * 2, Duration::from_millis(100), 8),
            8
        );
        assert_eq!(
            request_window(BLOCK_BYTES * 2, Duration::from_secs(20), 8),
            2
        );
        assert_eq!(request_window(BLOCK_BYTES, Duration::from_millis(1), 1), 1);
    }
}
