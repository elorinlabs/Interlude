//! Explicit, origin-bound streams for remote previews, independent of shell lifetimes.
use super::{destination, LinkError, LinkReply, LinkRequest, LinkState};
use std::sync::Arc;
use tauri::{AppHandle, Manager, Window};

const MAX_RESOURCES: usize = 32;

#[tauri::command]
pub(crate) async fn codex_gui_resource_open(
    app: AppHandle,
    window: Window,
    url: String,
) -> Result<String, String> {
    super::super::authorize(&window).map_err(|error| error.to_string())?;
    let state = app.state::<Arc<LinkState>>();
    open_resource(&state, url)
        .await
        .map_err(|error| error.to_string())
}

async fn open_resource(state: &Arc<LinkState>, url: String) -> super::Result<String> {
    destination(&url)?;
    let mut resources = state.resources.lock().await;
    if resources.len() >= MAX_RESOURCES {
        return Err(LinkError::Limit);
    }
    let scope = uuid::Uuid::new_v4().to_string();
    resources.insert(scope.clone(), url);
    Ok(scope)
}

fn resource_scope(request: &LinkRequest) -> Option<&str> {
    match request {
        LinkRequest::Connect { scope, .. }
        | LinkRequest::UdpConnect { scope, .. }
        | LinkRequest::UdpRead { scope, .. }
        | LinkRequest::UdpWrite { scope, .. }
        | LinkRequest::UdpClose { scope, .. }
        | LinkRequest::Read { scope, .. }
        | LinkRequest::Write { scope, .. }
        | LinkRequest::Close { scope, .. }
        | LinkRequest::Stop { scope } => Some(scope),
        _ => None,
    }
}

#[tauri::command]
pub(crate) async fn codex_gui_resource_link(
    app: AppHandle,
    window: Window,
    request: LinkRequest,
) -> Result<LinkReply, String> {
    super::super::authorize(&window).map_err(|error| error.to_string())?;
    let state = app.state::<Arc<LinkState>>();
    resource_request(&state, request)
        .await
        .map_err(|error| error.to_string())
}

async fn resource_request(
    state: &Arc<LinkState>,
    request: LinkRequest,
) -> super::Result<LinkReply> {
    let scope = resource_scope(&request)
        .ok_or(LinkError::Invalid)?
        .to_owned();
    let connecting = matches!(
        request,
        LinkRequest::Connect { .. } | LinkRequest::UdpConnect { .. }
    );
    {
        let mut resources = state.resources.lock().await;
        let url = resources.get(&scope).ok_or(LinkError::Closed)?;
        if let LinkRequest::Connect { url: target, .. }
        | LinkRequest::UdpConnect { url: target, .. } = &request
        {
            if destination(target)? != destination(url)? {
                return Err(LinkError::Invalid);
            }
        }
        if matches!(request, LinkRequest::Stop { .. }) {
            resources.remove(&scope);
        }
    }
    let reply = state.perform(request).await?;
    if connecting && !state.resources.lock().await.contains_key(&scope) {
        state.perform(LinkRequest::Stop { scope }).await?;
        return Err(LinkError::Closed);
    }
    Ok(reply)
}

#[cfg(test)]
#[path = "resource_tests.rs"]
mod tests;

pub(crate) async fn clear(app: &AppHandle) {
    let state = app.state::<Arc<LinkState>>();
    let scopes: Vec<_> = state
        .resources
        .lock()
        .await
        .drain()
        .map(|(id, _)| id)
        .collect();
    for scope in scopes {
        if let Err(error) = state.perform(LinkRequest::Stop { scope }).await {
            eprintln!("preview stream cleanup failed: {error}");
        }
    }
}
