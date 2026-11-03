//! Short polling requests keep directory compression independent of RPC timeouts.
use super::{file::StreamFile, response, FileStreams, GuiError, GuiResponse, Result};
use crate::codex_gui::project_entries::{self, ArchiveProgress};
use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::{Duration, Instant},
};

const MAX_ARCHIVES: usize = 2;
const ARCHIVE_IDLE_TIMEOUT: Duration = Duration::from_secs(120);

#[derive(Default)]
pub(super) struct Archives(Arc<Mutex<HashMap<String, Pending>>>);

struct Pending {
    transfer_id: String,
    job: Arc<Job>,
}

struct Job {
    cancelled: AtomicBool,
    state: Mutex<JobState>,
}

struct JobState {
    touched: Instant,
    progress: ArchiveProgress,
    result: Option<Result<StreamFile>>,
}

impl Drop for Pending {
    fn drop(&mut self) {
        self.job.cancelled.store(true, Ordering::Relaxed);
    }
}

impl Job {
    fn update(&self, progress: Option<&ArchiveProgress>) -> bool {
        let Ok(mut state) = self.state.lock() else {
            return false;
        };
        if self.cancelled.load(Ordering::Relaxed) || state.touched.elapsed() >= ARCHIVE_IDLE_TIMEOUT
        {
            return false;
        }
        if let Some(progress) = progress {
            state.progress = progress.clone();
        }
        true
    }

    fn finish(&self, result: Result<StreamFile>) {
        if let Ok(mut state) = self.state.lock() {
            if !self.cancelled.load(Ordering::Relaxed) {
                state.result = Some(result);
            }
        }
    }
}

impl Archives {
    fn expire_when_idle(&self, id: String) {
        let jobs = Arc::clone(&self.0);
        tauri::async_runtime::spawn(async move {
            loop {
                tokio::time::sleep(ARCHIVE_IDLE_TIMEOUT).await;
                let jobs = Arc::clone(&jobs);
                let id = id.clone();
                let expired = tauri::async_runtime::spawn_blocking(move || {
                    let mut jobs = jobs.lock().map_err(|_| GuiError::FileRead)?;
                    if jobs
                        .get(&id)
                        .is_some_and(|pending| pending.job.update(None))
                    {
                        return Ok(false);
                    }
                    jobs.remove(&id);
                    Ok::<_, GuiError>(true)
                })
                .await;
                match expired {
                    Ok(Ok(false)) => {}
                    Ok(Ok(true)) => break,
                    _ => {
                        eprintln!("Could not expire a download preparation.");
                        break;
                    }
                }
            }
        });
    }

    pub(super) fn cancel(&self, transfer_id: &str, id: &str) -> Result<()> {
        let mut jobs = self.0.lock().map_err(|_| GuiError::FileRead)?;
        if jobs
            .get(id)
            .is_some_and(|job| job.transfer_id != transfer_id)
        {
            return Err(GuiError::FileExpired);
        }
        jobs.remove(id);
        Ok(())
    }
}

impl FileStreams {
    pub(in crate::codex_gui) fn prepare_archive(
        &self,
        root: PathBuf,
        options: super::StreamOpen,
    ) -> Result<GuiResponse> {
        let id = uuid::Uuid::new_v4().to_string();
        let job = Arc::new(Job {
            cancelled: AtomicBool::new(false),
            state: Mutex::new(JobState {
                touched: Instant::now(),
                progress: ArchiveProgress::default(),
                result: None,
            }),
        });
        {
            let mut jobs = self.archives.0.lock().map_err(|_| GuiError::FileRead)?;
            jobs.retain(|_, pending| pending.job.update(None));
            if jobs.len() >= MAX_ARCHIVES {
                return Err(GuiError::FileBusy);
            }
            jobs.insert(
                id.clone(),
                Pending {
                    transfer_id: options.thread_id,
                    job: Arc::clone(&job),
                },
            );
        }
        let worker_job = Arc::clone(&job);
        let worker = tauri::async_runtime::spawn_blocking(move || {
            build_archive(root, options.path, options.max_bytes, &worker_job)
        });
        tauri::async_runtime::spawn(async move {
            job.finish(worker.await.unwrap_or(Err(GuiError::FileRead)));
        });
        self.archives.expire_when_idle(id.clone());
        preparation(&id, &ArchiveProgress::default())
    }

    pub(in crate::codex_gui) async fn archive_status(
        self: Arc<Self>,
        transfer_id: String,
        id: String,
    ) -> Result<GuiResponse> {
        tauri::async_runtime::spawn_blocking(move || self.poll_archive(&transfer_id, &id))
            .await
            .map_err(|_| GuiError::FileRead)?
    }

    fn poll_archive(&self, transfer_id: &str, id: &str) -> Result<GuiResponse> {
        let file = {
            let mut jobs = self.archives.0.lock().map_err(|_| GuiError::FileRead)?;
            let pending = jobs.get(id).ok_or(GuiError::FileExpired)?;
            if pending.transfer_id != transfer_id {
                return Err(GuiError::FileExpired);
            }
            if !pending.job.update(None) {
                jobs.remove(id);
                return Err(GuiError::FileExpired);
            }
            let mut state = pending.job.state.lock().map_err(|_| GuiError::FileRead)?;
            state.touched = Instant::now();
            let Some(result) = state.result.take() else {
                return preparation(id, &state.progress);
            };
            drop(state);
            jobs.remove(id);
            result?
        };
        response(self.insert_file(file, transfer_id.to_owned())?)
    }
}

fn build_archive(root: PathBuf, path: String, limit: u64, job: &Job) -> Result<StreamFile> {
    let (file, name) =
        project_entries::archive_with_progress(&root, &path, limit, &mut |progress| {
            job.update(Some(progress))
        })
        .map_err(GuiError::ProjectEntry)?;
    StreamFile::generated_checked(file, name, "application/zip".into(), &mut || {
        job.update(None)
    })
}

fn preparation(id: &str, progress: &ArchiveProgress) -> Result<GuiResponse> {
    Ok(GuiResponse {
        data: serde_json::json!({ "preparationId": id, "progress": progress }),
    })
}

#[cfg(test)]
mod tests;
