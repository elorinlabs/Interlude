//! Bounded datagram sessions. Peer IDs are opaque and never authorize arbitrary reply addresses.
mod local;
mod queue;
#[cfg(test)]
mod queue_tests;
mod remote;
mod session;
#[cfg(test)]
mod tests;

use super::{destination, LinkError, LinkReply, Result};
use base64::{engine::general_purpose::STANDARD, Engine};
use serde::{Deserialize, Serialize};
use session::Session;
use std::{collections::HashMap, net::SocketAddr, sync::Arc, time::Duration};
use tokio::{net::UdpSocket, sync::Mutex};

const MAX_SESSIONS: usize = 32;
const MAX_PEERS: usize = 64;
const MAX_DATAGRAM: usize = 65_507;
const PROTOCOL_VERSION: u8 = 2;
const MAX_BATCH: usize = 64;
const MAX_BATCH_BYTES: usize = 256 * 1024;
const QUEUE_SIZE: usize = 512;
const QUEUE_BYTES: usize = 2 * 1024 * 1024;
const PEER_IDLE: Duration = Duration::from_secs(60);
const SESSION_IDLE: Duration = Duration::from_secs(90);
const READ_WAIT: Duration = Duration::from_secs(10);

pub(super) fn require_version(version: u8) -> Result<()> {
    if version == PROTOCOL_VERSION {
        Ok(())
    } else {
        Err(LinkError::Invalid)
    }
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct Packet {
    pub peer: String,
    pub data: String,
}

struct Datagram {
    peer: String,
    data: Vec<u8>,
}

#[derive(Default)]
pub(super) struct Sessions(Mutex<HashMap<String, Arc<Session>>>);

impl Sessions {
    pub async fn listen(&self, port: u16) -> Result<LinkReply> {
        if port == 0 {
            return Err(LinkError::Invalid);
        }
        let socket = UdpSocket::bind((std::net::Ipv4Addr::LOCALHOST, port))
            .await
            .map_err(|error| match error.kind() {
                std::io::ErrorKind::AddrInUse => LinkError::PortInUse,
                _ => LinkError::Listen,
            })?;
        let id = uuid::Uuid::new_v4().to_string();
        self.insert(id.clone(), Session::local(id.clone(), socket))
            .await?;
        Ok(LinkReply::Listener { id, port })
    }

    pub async fn connect(&self, scope: String, url: String) -> Result<LinkReply> {
        let (host, port) = destination(&url)?;
        let ip = host
            .parse::<std::net::IpAddr>()
            .map_err(|_| LinkError::Invalid)?;
        if ip.is_unspecified() || ip.is_multicast() || port == 0 {
            return Err(LinkError::Invalid);
        }
        let id = uuid::Uuid::new_v4().to_string();
        self.insert(
            id.clone(),
            Session::remote(scope, SocketAddr::new(ip, port)),
        )
        .await?;
        Ok(LinkReply::Socket { id })
    }

    async fn insert(&self, id: String, session: Session) -> Result<()> {
        let mut sessions = self.0.lock().await;
        sessions.retain(|_, value| !value.closed());
        if sessions.len() >= MAX_SESSIONS {
            drop(sessions);
            session.close().await;
            return Err(LinkError::Limit);
        }
        sessions.insert(id, Arc::new(session));
        Ok(())
    }

    async fn get(&self, scope: &str, id: &str) -> Result<Arc<Session>> {
        self.0
            .lock()
            .await
            .get(id)
            .filter(|session| session.scope == scope && !session.closed())
            .cloned()
            .ok_or(LinkError::Closed)
    }

    pub async fn read(&self, scope: &str, id: &str) -> Result<LinkReply> {
        self.get(scope, id).await?.read().await
    }

    pub async fn write(&self, scope: &str, id: &str, packets: Vec<Packet>) -> Result<LinkReply> {
        let session = self.get(scope, id).await?;
        let encoded_limit = MAX_BATCH_BYTES.div_ceil(3) * 4 + MAX_BATCH * 4;
        if packets.len() > MAX_BATCH
            || packets
                .iter()
                .map(|packet| packet.data.len())
                .sum::<usize>()
                > encoded_limit
        {
            return Err(LinkError::Invalid);
        }
        let datagrams = packets
            .into_iter()
            .map(decode)
            .collect::<Result<Vec<_>>>()?;
        if datagrams
            .iter()
            .map(|packet| packet.data.len())
            .sum::<usize>()
            > MAX_BATCH_BYTES
        {
            return Err(LinkError::Invalid);
        }
        session.write(datagrams).await?;
        Ok(LinkReply::Done)
    }

    pub async fn close(&self, scope: &str, id: &str) -> Result<LinkReply> {
        let mut sessions = self.0.lock().await;
        if let Some(session) = sessions.get(id) {
            if session.scope != scope {
                return Err(LinkError::Closed);
            }
        }
        let session = sessions.remove(id);
        drop(sessions);
        if let Some(session) = session {
            session.close().await;
        }
        Ok(LinkReply::Done)
    }

    pub async fn stop(&self, scope: &str) {
        let mut sessions = self.0.lock().await;
        let ids: Vec<_> = sessions
            .iter()
            .filter(|(_, value)| value.scope == scope)
            .map(|(id, _)| id.clone())
            .collect();
        let removed: Vec<_> = ids.iter().filter_map(|id| sessions.remove(id)).collect();
        drop(sessions);
        for session in removed {
            session.close().await;
        }
    }
}

fn decode(packet: Packet) -> Result<Datagram> {
    if packet.peer.is_empty()
        || packet.peer.len() > 64
        || !packet
            .peer
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-')
        || packet.data.len() > MAX_DATAGRAM.div_ceil(3) * 4
    {
        return Err(LinkError::Invalid);
    }
    let data = STANDARD
        .decode(packet.data)
        .map_err(|_| LinkError::Invalid)?;
    if data.len() > MAX_DATAGRAM {
        return Err(LinkError::Invalid);
    }
    Ok(Datagram {
        peer: packet.peer,
        data,
    })
}
