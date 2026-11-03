use super::{Error, Result};
use serde::Serialize;
use std::{
    process::Child,
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
};

#[derive(Clone, Copy, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum Phase {
    #[default]
    Idle,
    Downloading,
    Verifying,
    Installing,
    Starting,
}

#[derive(Default)]
pub(crate) struct CozeState {
    pub(super) busy: AtomicBool,
    pub(super) progress: Mutex<Progress>,
    pub(super) process: Mutex<Option<Running>>,
}

#[derive(Default, Clone)]
pub(super) struct Progress {
    pub phase: Phase,
    pub downloaded: u64,
    pub total: Option<u64>,
}

pub(super) struct Running {
    pub child: Child,
    pub url: String,
}

impl Drop for Running {
    fn drop(&mut self) {
        // Dropping stdin also revokes the runtime's parent lease; kill covers blocked startup.
        self.child.stdin.take();
        if let Err(error) = self.child.kill() {
            eprintln!("Coze shutdown: {error}");
        }
        if let Err(error) = self.child.wait() {
            eprintln!("Coze wait: {error}");
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Status {
    pub installed: bool,
    pub version: String,
    pub phase: Phase,
    pub downloaded: u64,
    pub total: Option<u64>,
    pub url: Option<String>,
}

pub(super) struct Operation<'a>(&'a CozeState);

impl CozeState {
    pub(super) fn begin(&self) -> Result<Operation<'_>> {
        if self.busy.swap(true, Ordering::AcqRel) {
            return Err(Error::Busy);
        }
        Ok(Operation(self))
    }

    pub(super) fn progress(&self, phase: Phase, downloaded: u64, total: Option<u64>) -> Result<()> {
        *self.progress.lock().map_err(|_| Error::Storage)? = Progress {
            phase,
            downloaded,
            total,
        };
        Ok(())
    }
}

impl Drop for Operation<'_> {
    fn drop(&mut self) {
        if let Ok(mut progress) = self.0.progress.lock() {
            *progress = Progress::default();
        }
        self.0.busy.store(false, Ordering::Release);
    }
}
