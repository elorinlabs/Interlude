use super::{Error, Result};
use serde::Serialize;

#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ArchiveProgress {
    pub phase: ArchivePhase,
    pub processed_bytes: u64,
    pub total_bytes: u64,
    pub completed_files: usize,
    pub total_files: usize,
}

#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum ArchivePhase {
    #[default]
    Scanning,
    Compressing,
    Finalizing,
}

/// Returning false cancels scanning/compression at the next bounded work unit.
pub(super) struct Reporter<'a> {
    pub progress: ArchiveProgress,
    pub report: &'a mut dyn FnMut(&ArchiveProgress) -> bool,
}

impl Reporter<'_> {
    pub fn publish(&mut self) -> Result<()> {
        if !(self.report)(&self.progress) {
            return Err(Error::Cancelled);
        }
        Ok(())
    }
}
