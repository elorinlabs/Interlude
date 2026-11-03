//! Only an explicit catalog refresh may let the CLI query upstream models.
use std::sync::atomic::{AtomicUsize, Ordering};

#[derive(Default)]
pub(crate) struct ModelDiscovery {
    refreshes: AtomicUsize,
}

impl ModelDiscovery {
    pub(crate) fn begin(&self) -> ModelDiscoveryPermit<'_> {
        self.refreshes.fetch_add(1, Ordering::AcqRel);
        ModelDiscoveryPermit(self)
    }

    pub(crate) fn allowed(&self) -> bool {
        self.refreshes.load(Ordering::Acquire) > 0
    }
}

pub(crate) struct ModelDiscoveryPermit<'a>(&'a ModelDiscovery);

impl Drop for ModelDiscoveryPermit<'_> {
    fn drop(&mut self) {
        self.0.refreshes.fetch_sub(1, Ordering::AcqRel);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn discovery_is_disabled_outside_explicit_refreshes() {
        let state = ModelDiscovery::default();
        assert!(!state.allowed());
        let first = state.begin();
        let second = state.begin();
        assert!(state.allowed());
        drop(first);
        assert!(state.allowed());
        drop(second);
        assert!(!state.allowed());
    }
}
