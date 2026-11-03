use std::{thread, time::Duration};

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use serde_json::Value;
use tokio::sync::watch;

use super::protocol::ChatError;

const REFRESH_INTERVAL: Duration = Duration::from_secs(10);

#[derive(Clone, PartialEq, Eq)]
pub(super) struct Config {
    pub websocket_url: String,
    pub access_token: String,
    pub device_id: String,
    pub owner: String,
}

impl Config {
    pub fn from_cloud(config: crate::cloud::RemoteControlConfig) -> Result<Self, ChatError> {
        // This is identity comparison, not JWT verification. The cloud gateway verifies the token.
        let payload = config
            .access_token
            .split('.')
            .nth(1)
            .ok_or(ChatError::InvalidFrame)?;
        let bytes = URL_SAFE_NO_PAD
            .decode(payload.trim_end_matches('='))
            .map_err(|_| ChatError::InvalidFrame)?;
        let claims: Value = serde_json::from_slice(&bytes).map_err(|_| ChatError::InvalidFrame)?;
        let subject = claims
            .get("sub")
            .filter(|value| !value.is_null())
            .ok_or(ChatError::InvalidFrame)?;
        Ok(Self {
            websocket_url: config
                .websocket_url
                .trim_end_matches("device-switch")
                .to_owned()
                + "device-chat",
            access_token: config.access_token,
            device_id: config.device_id,
            owner: subject.to_string(),
        })
    }

    pub fn same_owner(&self, next: &Self) -> bool {
        self.owner == next.owner
            && self.device_id == next.device_id
            && self.websocket_url == next.websocket_url
    }
}

pub(super) fn watch<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> watch::Receiver<Option<Config>> {
    let (sender, receiver) = watch::channel(None);
    // Credential renewal can wait on disk, a shared cloud lock or the network. It must never
    // block the socket worker's heartbeat or its response to frontend messages.
    thread::spawn(move || loop {
        if sender.is_closed() {
            break;
        }
        match crate::cloud::remote_control_config(&app) {
            Ok(config) => match config.map(Config::from_cloud).transpose() {
                Ok(config) => {
                    sender.send_replace(config);
                }
                Err(_) => {
                    sender.send_replace(None);
                }
            },
            Err(_) => eprintln!("remote chat: credential refresh temporarily unavailable"),
        }
        thread::sleep(REFRESH_INTERVAL);
    });
    receiver
}
