//! Version 2: bounded binary blocks on a reusable authenticated connection.
use super::{
    policy::Policy,
    snapshot::{Manifest, Snapshot},
    Error, Result,
};
use csw_chat_connectivity::{Connection, Event};
use serde::{Deserialize, Serialize};
use std::{collections::VecDeque, sync::Arc, time::Duration};

const OPEN_TIMEOUT: Duration = Duration::from_secs(12);
const PREPARE_TIMEOUT: Duration = Duration::from_secs(45);
const REQUEST_TIMEOUT: Duration = Duration::from_secs(45);
const PACKET_BYTES: usize = 64 * 1024;

#[derive(Deserialize, Serialize)]
#[serde(tag = "type", rename_all = "kebab-case")]
enum Message {
    Describe {
        artifact: String,
    },
    Manifest {
        size: usize,
        hashes: Vec<String>,
        #[serde(default = "legacy_window", rename = "requestWindow")]
        request_window: usize,
    },
    Read {
        index: usize,
    },
    Block {
        index: usize,
        length: usize,
    },
}

fn legacy_window() -> usize {
    1
}

async fn send(connection: &Connection, message: &Message) -> Result<()> {
    connection
        .send(serde_json::to_string(message).map_err(|_| Error::Invalid)?)
        .await?;
    Ok(())
}

async fn opened(connection: &Connection) -> Result<Option<Message>> {
    tokio::time::timeout(OPEN_TIMEOUT, async {
        let mut open = false;
        loop {
            match connection.receive().await {
                Some(Event::Open) => open = true,
                Some(Event::Status { route }) if open && route.direct => return Ok(None),
                Some(Event::Data { text }) if open => {
                    return serde_json::from_str(&text)
                        .map(Some)
                        .map_err(|_| Error::Invalid);
                }
                Some(Event::Closed) | None => return Err(Error::Unavailable),
                _ => {}
            }
        }
    })
    .await
    .map_err(|_| Error::Unavailable)?
}

async fn receive(connection: &Connection) -> Result<Message> {
    loop {
        match connection.receive().await {
            Some(Event::Data { text }) => {
                return serde_json::from_str(&text).map_err(|_| Error::Invalid)
            }
            Some(Event::Closed | Event::Open) | None => return Err(Error::Unavailable),
            Some(Event::Status { route }) if !route.direct => return Err(Error::Unavailable),
            _ => {}
        }
    }
}

pub(super) async fn manifest(connection: &Connection, artifact: &str) -> Result<Manifest> {
    if opened(connection).await?.is_some() {
        return Err(Error::Invalid);
    }
    send(
        connection,
        &Message::Describe {
            artifact: artifact.into(),
        },
    )
    .await?;
    let response = tokio::time::timeout(PREPARE_TIMEOUT, receive(connection))
        .await
        .map_err(|_| Error::Unavailable)??;
    let Message::Manifest {
        size,
        hashes,
        request_window,
    } = response
    else {
        return Err(Error::Invalid);
    };
    let manifest = Manifest {
        size,
        hashes,
        request_window: request_window.clamp(1, super::snapshot::MAX_REQUESTS),
    };
    manifest.validate()?;
    Ok(manifest)
}

pub(super) struct Reader {
    connection: Arc<Connection>,
    pub manifest: Manifest,
    headers: VecDeque<Message>,
}

impl Reader {
    pub async fn open(connection: Arc<Connection>, artifact: &str) -> Result<Self> {
        let manifest = manifest(&connection, artifact).await?;
        Ok(Self {
            connection,
            manifest,
            headers: VecDeque::new(),
        })
    }

    pub async fn request(&self, indices: &[usize]) -> Result<()> {
        if indices.is_empty() || indices.len() > self.manifest.request_window {
            return Err(Error::Invalid);
        }
        for &index in indices {
            self.manifest.length(index)?;
            send(&self.connection, &Message::Read { index }).await?;
        }
        Ok(())
    }

    pub async fn block(&mut self, index: usize) -> Result<Vec<u8>> {
        let length = self.manifest.length(index)?;
        let header = match self.headers.pop_front() {
            Some(header) => header,
            None => receive(&self.connection).await?,
        };
        match header {
            Message::Block {
                index: received,
                length: offered,
            } if received == index && offered == length => {}
            _ => return Err(Error::Invalid),
        }
        let mut bytes = Vec::with_capacity(length);
        while bytes.len() < length {
            tokio::select! {
                packet = self.connection.receive_packet() => {
                    let packet = packet.ok_or(Error::Unavailable)?;
                    if packet.is_empty() || packet.len() > PACKET_BYTES || packet.len() > length - bytes.len() {
                        return Err(Error::Invalid);
                    }
                    bytes.extend_from_slice(&packet);
                }
                message = receive(&self.connection) => {
                    if self.headers.len() >= self.manifest.request_window { return Err(Error::Invalid); }
                    // Control frames can overtake payload consumption across the two bounded queues.
                    self.headers.push_back(message?);
                }
            }
        }
        self.manifest.verify(index, &bytes)?;
        Ok(bytes)
    }
}

pub(super) async fn seed(
    connection: &Connection,
    snapshot: Arc<Snapshot>,
    artifact: &str,
    policy: &Policy,
) -> Result<()> {
    let first = match opened(connection).await? {
        Some(message) => message,
        None => tokio::time::timeout(PREPARE_TIMEOUT, receive(connection))
            .await
            .map_err(|_| Error::Unavailable)??,
    };
    if !matches!(first, Message::Describe { artifact: id } if id == artifact) {
        return Err(Error::Invalid);
    }
    send(
        connection,
        &Message::Manifest {
            size: snapshot.manifest.size,
            hashes: snapshot.manifest.hashes.clone(),
            request_window: super::snapshot::MAX_REQUESTS,
        },
    )
    .await?;
    let mut pending = None;
    loop {
        let request = match pending.take() {
            Some(request) => request,
            None => tokio::time::timeout(REQUEST_TIMEOUT, receive(connection))
                .await
                .map_err(|_| Error::Unavailable)??,
        };
        let Message::Read { index } = request else {
            return Err(Error::Invalid);
        };
        let bytes = snapshot.block(index).await?;
        send(
            connection,
            &Message::Block {
                index,
                length: bytes.len(),
            },
        )
        .await?;
        pending = upload(connection, &bytes, policy).await?;
    }
}

async fn upload(connection: &Connection, bytes: &[u8], policy: &Policy) -> Result<Option<Message>> {
    let transfer = async {
        for packet in bytes.chunks(PACKET_BYTES) {
            policy.throttle(packet.len()).await?;
            connection.send_packet(packet.to_vec()).await?;
        }
        Ok::<_, Error>(())
    };
    tokio::pin!(transfer);
    // Drain diagnostic/route events during a throttled upload, preserving an early next request.
    tokio::select! {
        result = &mut transfer => { result?; Ok(None) }
        message = receive(connection) => { let message = message?; transfer.await?; Ok(Some(message)) }
    }
}
