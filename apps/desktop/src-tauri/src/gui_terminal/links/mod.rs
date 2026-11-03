//! Byte streams for viewing a remote terminal's development server through its authenticated chat.
#[cfg(test)]
mod chunk_tests;
#[cfg(test)]
mod relay_tests;
pub(crate) mod resources;
mod sockets;
#[cfg(test)]
mod tests;
mod udp;

use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::{AppHandle, Manager, Window};

pub(crate) use sockets::LinkState;

#[derive(Debug, thiserror::Error)]
pub(crate) enum LinkError {
    #[error("链接无效，请检查后重试。")]
    Invalid,
    #[error("连接较多，请稍后重试。")]
    Limit,
    #[error("网页连接已断开，请重新打开链接。")]
    Closed,
    #[error("无法连接网页，请确认服务已启动。")]
    Network,
    #[error("本地端口已被占用，请换一个端口。")]
    PortInUse,
    #[error("无法监听本地端口，请换一个端口重试。")]
    Listen,
}
type Result<T> = std::result::Result<T, LinkError>;

#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "camelCase", deny_unknown_fields)]
pub(crate) enum LinkRequest {
    Listen {
        #[serde(default)]
        port: Option<u16>,
    },
    Accept {
        scope: String,
    },
    Connect {
        scope: String,
        url: String,
    },
    Read {
        scope: String,
        id: String,
    },
    Write {
        scope: String,
        id: String,
        data: String,
    },
    Close {
        scope: String,
        id: String,
    },
    Stop {
        scope: String,
    },
    UdpListen {
        port: u16,
        version: u8,
    },
    UdpConnect {
        scope: String,
        url: String,
        version: u8,
    },
    UdpRead {
        scope: String,
        id: String,
    },
    UdpWrite {
        scope: String,
        id: String,
        packets: Vec<udp::Packet>,
    },
    UdpClose {
        scope: String,
        id: String,
    },
}

#[derive(Debug, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub(crate) enum LinkReply {
    Listener { id: String, port: u16 },
    Socket { id: String },
    Data { data: String, eof: bool },
    Done,
    Datagrams { packets: Vec<udp::Packet> },
}

#[tauri::command]
pub(crate) async fn codex_gui_terminal_link(
    app: AppHandle,
    window: Window,
    request: LinkRequest,
) -> std::result::Result<LinkReply, String> {
    super::authorize(&window).map_err(|error| error.to_string())?;
    // Remote UDP destinations are authorized only through origin-bound resources.
    if matches!(&request, LinkRequest::UdpConnect { .. }) {
        return Err(LinkError::Invalid.to_string());
    }
    if let LinkRequest::Connect { scope, .. } = &request {
        let terminals = app.state::<Arc<super::TerminalState>>().inner().clone();
        let id = scope.clone();
        tauri::async_runtime::spawn_blocking(move || terminals.ensure_open(&id))
            .await
            .map_err(|_| LinkError::Closed.to_string())?
            .map_err(|error| error.to_string())?;
    }
    app.state::<Arc<LinkState>>()
        .inner()
        .perform(request)
        .await
        .map_err(|error| error.to_string())
}

fn destination(value: &str) -> Result<(String, u16)> {
    let url = url::Url::parse(value).map_err(|_| LinkError::Invalid)?;
    if !matches!(url.scheme(), "http" | "https")
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err(LinkError::Invalid);
    }
    let host = url
        .host_str()
        .ok_or(LinkError::Invalid)?
        .trim_matches(['[', ']']);
    let host = match host {
        "0.0.0.0" => "127.0.0.1",
        "::" => "::1",
        host => host,
    };
    Ok((
        host.into(),
        url.port_or_known_default().ok_or(LinkError::Invalid)?,
    ))
}
