use super::types::{HelpAnswer, HelpError, HelpRequest, Result};
use crate::codex_gui::{account_selection, GuiState};
use std::time::Duration;
use tauri::{AppHandle, State};
use tokio::sync::{watch, Mutex};

const RUN_TIMEOUT: Duration = Duration::from_secs(600);

struct ActiveRequest {
    id: Option<String>,
    cancel: watch::Sender<bool>,
}

#[derive(Default)]
pub(crate) struct RequestControl(Mutex<Option<ActiveRequest>>);

impl RequestControl {
    async fn cancel(&self, id: &str) {
        let active = self.0.lock().await;
        if let Some(request) = active
            .as_ref()
            .filter(|request| request.id.as_deref() == Some(id))
        {
            request.cancel.send_replace(true);
        }
    }
}

pub(super) async fn answer(
    app: AppHandle,
    state: &GuiState,
    request: HelpRequest,
) -> Result<HelpAnswer> {
    let _slot = state.help_request.try_lock().map_err(|_| HelpError::Busy)?;
    let revision = request.account_revision;
    let (cancel, mut cancelled) = watch::channel(false);
    *state.help_control.0.lock().await = Some(ActiveRequest {
        id: request.request_id.clone(),
        cancel,
    });
    let result = tokio::select! {
        biased;
        _ = cancelled.changed() => Err(HelpError::Cancelled),
        error = account_changed(&app, revision) => Err(error),
        result = tokio::time::timeout(RUN_TIMEOUT, super::answer(app.clone(), state, request)) =>
            result.unwrap_or(Err(HelpError::AnswerFailed)),
    };
    *state.help_control.0.lock().await = None;
    result
}

/// Stop only the matching help request, without touching GUI conversations.
#[tauri::command]
pub(crate) async fn remote_ai_help_cancel(
    state: State<'_, GuiState>,
    request_id: String,
) -> std::result::Result<(), String> {
    uuid::Uuid::parse_str(&request_id).map_err(|_| HelpError::InvalidRequest.to_string())?;
    state.help_control.cancel(&request_id).await;
    Ok(())
}

pub(super) async fn check_account(app: &AppHandle, revision: u64) -> Result<()> {
    let app = app.clone();
    let current = tauri::async_runtime::spawn_blocking(move || account_selection::snapshot(&app))
        .await
        .map_err(|_| HelpError::Unavailable)?
        .map_err(|_| HelpError::Unavailable)?;
    if current.revision == revision {
        Ok(())
    } else {
        Err(HelpError::AccountChanged)
    }
}

async fn account_changed(app: &AppHandle, revision: u64) -> HelpError {
    loop {
        if let Err(error) = check_account(app, revision).await {
            return error;
        }
        tokio::time::sleep(Duration::from_millis(500)).await;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn stale_stop_requests_do_not_cancel_another_question() {
        let state = RequestControl::default();
        let (cancel, mut receiver) = watch::channel(false);
        *state.0.lock().await = Some(ActiveRequest {
            id: Some("current".into()),
            cancel,
        });
        state.cancel("previous").await;
        assert!(!*receiver.borrow());
        state.cancel("current").await;
        receiver.changed().await.unwrap();
        assert!(*receiver.borrow());
    }
}
