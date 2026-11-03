mod account;
mod audio;
mod error;
mod sessions;
#[cfg(test)]
mod tests;
mod transport;

use super::GuiState;
use error::{Error, Result};
use serde::{Deserialize, Serialize};
pub(crate) use sessions::Sessions;
use tauri::{AppHandle, State};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Prepared {
    session_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TranscribeRequest {
    session_id: String,
    data: String,
    mime_type: String,
}

#[derive(Serialize)]
pub(crate) struct Transcribed {
    text: String,
}

#[tauri::command]
pub(crate) async fn codex_gui_dictation_prepare(
    app: AppHandle,
    state: State<'_, GuiState>,
) -> std::result::Result<Prepared, String> {
    async {
        let account = tauri::async_runtime::spawn_blocking(move || account::selected(&app))
            .await
            .map_err(|_| Error::Unavailable)??;
        Ok::<_, Error>(Prepared {
            session_id: state.dictation.create(account).await?,
        })
    }
    .await
    .map_err(|error| error.to_string())
}

#[tauri::command]
pub(crate) async fn codex_gui_dictation_transcribe(
    app: AppHandle,
    state: State<'_, GuiState>,
    request: TranscribeRequest,
) -> std::result::Result<Transcribed, String> {
    run(app, &state.dictation, request)
        .await
        .map(|text| Transcribed { text })
        .map_err(|error| error.to_string())
}

async fn run(app: AppHandle, sessions: &Sessions, request: TranscribeRequest) -> Result<String> {
    let (account, mut cancel) = sessions.begin(&request.session_id).await?;
    let operation = async {
        let audio = tauri::async_runtime::spawn_blocking(move || {
            audio::decode(&request.data, &request.mime_type)
        })
        .await
        .map_err(|_| Error::Unavailable)??;
        transport::transcribe(app, account, audio).await
    };
    let result = tokio::select! {
        biased;
        _ = cancel.changed() => Err(Error::Cancelled),
        result = operation => result,
    };
    sessions.finish(&request.session_id, result.is_ok()).await;
    result
}

#[tauri::command]
pub(crate) async fn codex_gui_dictation_cancel(
    state: State<'_, GuiState>,
    session_id: String,
) -> std::result::Result<(), String> {
    state.dictation.cancel(&session_id).await;
    Ok(())
}
