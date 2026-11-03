//! Native Antigravity profiles are isolated from Codex accounts and cloud synchronization.
pub(crate) mod model;
mod platform;
mod store;

use model::{Error, Result, Snapshot};
use serde::Deserialize;
use std::{sync::Mutex, time::Duration};

static OPERATION: Mutex<()> = Mutex::new(());

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub(crate) enum Action {
    List,
    Capture,
    Login,
    Refresh,
    Launch,
    Switch { id: String },
    Delete { id: String },
}

fn perform<R: tauri::Runtime>(app: &tauri::AppHandle<R>, action: Action) -> Result<Snapshot> {
    let _guard = OPERATION.try_lock().map_err(|_| Error::Busy)?;
    match action {
        Action::List => (),
        Action::Capture => store::capture(app)?,
        Action::Refresh => store::refresh(app)?,
        Action::Launch => platform::launch()?,
        Action::Switch { id } => store::switch(app, &id)?,
        Action::Delete { id } => store::delete(app, &id)?,
        Action::Login => {
            // The official app owns the browser OAuth flow. Launch/focus it first;
            // capture is performed after the user finishes sign-in.
            platform::launch()?;
        }
    }
    store::snapshot(app)
}

#[tauri::command]
pub(crate) async fn antigravity_accounts<R: tauri::Runtime + 'static>(
    app: tauri::AppHandle<R>,
    action: Action,
) -> std::result::Result<Snapshot, String> {
    tauri::async_runtime::spawn_blocking(move || {
        use tauri::Emitter;
        store::configure(&app)?;
        let list = matches!(action, Action::List);
        let result = if list {
            store::snapshot(&app)
        } else {
            perform(&app, action)
        };
        if !list && result.is_ok() {
            // Event delivery is best effort: persisted account state remains authoritative.
            let _ = app.emit("interlude-antigravity-updated", ());
        }
        result
    })
    .await
    .map_err(|_| "storage".to_string())?
    .map_err(|error| error.to_string())
}

pub(crate) fn widget_account(app: &tauri::AppHandle) -> Result<Option<model::Account>> {
    store::configure(app)?;
    let snapshot = store::snapshot(app)?;
    Ok(snapshot
        .accounts
        .into_iter()
        .find(|a| Some(&a.id) == snapshot.active_id.as_ref()))
}

pub(crate) fn start_widget_refresh(app: tauri::AppHandle) {
    tauri::async_runtime::spawn(async move {
        let mut delay = 60;
        loop {
            tokio::time::sleep(Duration::from_secs(delay)).await;
            let worker = app.clone();
            let result = tauri::async_runtime::spawn_blocking(move || {
                use tauri::Emitter;
                let _guard = OPERATION.try_lock().map_err(|_| Error::Busy)?;
                // Saved profiles opt in to active-account refresh, even without a widget.
                if store::read(&worker)?.is_empty() {
                    return Ok(());
                }
                let result = store::refresh(&worker);
                let _ = worker.emit("interlude-antigravity-updated", ());
                result
            })
            .await;
            delay = if matches!(result, Ok(Ok(()))) {
                60
            } else {
                (delay * 2).min(300)
            };
        }
    });
}
