use super::{Error, Result, State, MAX_RECORD_BYTES};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::{
    ipc::{InvokeBody, Request, Response},
    AppHandle, Manager, Webview,
};
use uuid::Uuid;
use zeroize::Zeroizing;

#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "camelCase", deny_unknown_fields)]
pub(crate) enum ReceiverRequest {
    Register {
        id: String,
        epoch: String,
        key: String,
    },
    Bind {
        id: String,
        request: String,
        socket: u32,
    },
    Unbind {
        id: String,
        request: String,
    },
    Close {
        id: String,
        reason: Option<CloseReason>,
    },
}
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum CloseReason {
    Poll,
    Receive,
    Queue,
    Unbind,
}
#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "camelCase", deny_unknown_fields)]
pub(crate) enum SocketRequest {
    Attach { scope: String, id: String },
    Close { id: u32 },
}
#[derive(Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub(crate) enum SocketReply {
    Socket { id: u32 },
    Done,
}

fn authorize(window: &Webview) -> std::result::Result<(), String> {
    if window.label() == "main" {
        Ok(())
    } else {
        Err(Error::Invalid.to_string())
    }
}
fn uuid(id: &str) -> Result<Uuid> {
    Uuid::parse_str(id).map_err(|_| Error::Invalid)
}

fn receiver_request(state: &State, request: ReceiverRequest) -> Result<()> {
    match request {
        ReceiverRequest::Register { id, epoch, key } => {
            let key = Zeroizing::new(key);
            let key = decode_key(&key)?;
            state.register(uuid(&id)?, uuid(&epoch)?, key.as_slice())
        }
        ReceiverRequest::Bind {
            id,
            request,
            socket,
        } => state
            .receiver(&uuid(&id)?)?
            .bind(uuid(&request)?, state.socket(socket)?),
        ReceiverRequest::Unbind { id, request } => {
            state.receiver(&uuid(&id)?)?.unbind(&uuid(&request)?)
        }
        ReceiverRequest::Close { id, reason } => {
            if let Some(reason) = reason {
                crate::error_logs::record_codex_error(&format!(
                    "Port mapping bridge stopped: {reason:?}"
                ));
            }
            state.close(&uuid(&id)?)
        }
    }
}
fn decode_key(key: &str) -> Result<Zeroizing<Vec<u8>>> {
    if key.len() != 64 || !key.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err(Error::Invalid);
    }
    let bytes: std::result::Result<Vec<_>, _> = (0..64)
        .step_by(2)
        .map(|i| u8::from_str_radix(&key[i..i + 2], 16))
        .collect();
    Ok(Zeroizing::new(bytes.map_err(|_| Error::Invalid)?))
}

#[tauri::command]
pub(crate) async fn port_mapping_receiver(
    app: AppHandle,
    window: Webview,
    request: ReceiverRequest,
) -> std::result::Result<(), String> {
    authorize(&window)?;
    receiver_request(&app.state::<Arc<State>>(), request).map_err(|error| error.to_string())
}

#[tauri::command]
pub(crate) async fn port_mapping_poll(
    app: AppHandle,
    window: Webview,
    id: String,
) -> std::result::Result<super::receiver::Poll, String> {
    authorize(&window)?;
    let receiver = uuid(&id)
        .and_then(|id| app.state::<Arc<State>>().receiver(&id))
        .map_err(|error| error.to_string())?;
    receiver.poll().await.map_err(|error| error.to_string())
}

#[tauri::command]
pub(crate) async fn port_mapping_socket(
    app: AppHandle,
    window: Webview,
    request: SocketRequest,
) -> std::result::Result<SocketReply, String> {
    authorize(&window)?;
    let state = app.state::<Arc<State>>();
    match request {
        SocketRequest::Attach { scope, id } => {
            let links = app.state::<Arc<crate::gui_terminal::links::LinkState>>();
            let halves = links
                .take_loopback_socket(&scope, &id)
                .await
                .map_err(|error| error.to_string())?;
            state
                .attach(halves)
                .map(|id| SocketReply::Socket { id })
                .map_err(|error| error.to_string())
        }
        SocketRequest::Close { id } => state
            .close_socket(id)
            .map(|()| SocketReply::Done)
            .map_err(|error| error.to_string()),
    }
}

#[tauri::command]
pub(crate) async fn port_mapping_read(
    app: AppHandle,
    window: Webview,
    id: u32,
) -> std::result::Result<Response, String> {
    authorize(&window)?;
    app.state::<Arc<State>>()
        .read(id)
        .await
        .map(Response::new)
        .map_err(|error| error.to_string())
}

fn route_batch(state: &State, bytes: &[u8]) -> Result<()> {
    if bytes.len() < 5
        || bytes.len() > 5 + 16 * (4 + MAX_RECORD_BYTES)
        || &bytes[..4] != b"RAN1"
        || !(1..=16).contains(&bytes[4])
    {
        return Err(Error::Invalid);
    }
    let mut cursor = 5;
    let mut records = Vec::new();
    for _ in 0..bytes[4] {
        let size = bytes.get(cursor..cursor + 4).ok_or(Error::Invalid)?;
        let size = u32::from_be_bytes(size.try_into().map_err(|_| Error::Invalid)?) as usize;
        if size > MAX_RECORD_BYTES {
            return Err(Error::Invalid);
        }
        cursor += 4;
        records.push(bytes.get(cursor..cursor + size).ok_or(Error::Invalid)?);
        cursor += size;
    }
    if cursor != bytes.len() {
        return Err(Error::Invalid);
    }
    for record in records {
        if !state.route(record) {
            return Err(Error::Closed);
        }
    }
    Ok(())
}

/// Browser RTC records use the same authenticated sink as native direct and server relay records.
#[tauri::command]
pub(crate) async fn port_mapping_receive(
    app: AppHandle,
    window: Webview,
    request: Request<'_>,
) -> std::result::Result<(), String> {
    authorize(&window)?;
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err(Error::Invalid.to_string());
    };
    route_batch(&app.state::<Arc<State>>(), bytes).map_err(|error| error.to_string())
}
