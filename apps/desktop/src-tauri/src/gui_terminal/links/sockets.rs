use super::{destination, LinkError, LinkReply, LinkRequest, Result};
use base64::{engine::general_purpose::STANDARD, Engine};
use std::{
    collections::HashMap,
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc,
    },
    time::{Duration, Instant},
};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::{
        tcp::{OwnedReadHalf, OwnedWriteHalf},
        TcpListener, TcpStream,
    },
    sync::{watch, Mutex},
    time::timeout,
};

const MAX_SOCKETS: usize = 64;
const MAX_LISTENERS: usize = 16;
const CHUNK_BYTES: usize = 384 * 1024;
const READ_WAIT: Duration = Duration::from_secs(10);
const IDLE_TIMEOUT: Duration = Duration::from_secs(90);

struct Lifetime {
    created: Instant,
    activity: AtomicU64,
    cancel: watch::Sender<bool>,
}
impl Lifetime {
    fn new() -> Self {
        Self {
            created: Instant::now(),
            activity: AtomicU64::new(0),
            cancel: watch::channel(false).0,
        }
    }
    fn touch(&self) {
        self.activity
            .store(self.created.elapsed().as_secs(), Ordering::Relaxed);
    }
    fn expired(&self) -> bool {
        *self.cancel.borrow()
            || self
                .created
                .elapsed()
                .as_secs()
                .saturating_sub(self.activity.load(Ordering::Relaxed))
                >= IDLE_TIMEOUT.as_secs()
    }
}
struct Socket {
    scope: String,
    reader: Mutex<OwnedReadHalf>,
    writer: Mutex<OwnedWriteHalf>,
    life: Lifetime,
}
struct Listener {
    socket: Mutex<Option<TcpListener>>,
    life: Lifetime,
}

/// Handles are scoped to one terminal or one loopback listener and expire when their client leaves.
#[derive(Default)]
pub(crate) struct LinkState {
    udp: super::udp::Sessions,
    pub(super) resources: Mutex<HashMap<String, String>>,
    sockets: Mutex<HashMap<String, Arc<Socket>>>,
    listeners: Mutex<HashMap<String, Arc<Listener>>>,
}

impl LinkState {
    /// Transfer only a socket accepted by an active loopback listener to the native mapping sink.
    pub(crate) async fn take_loopback_socket(
        &self,
        scope: &str,
        id: &str,
    ) -> Result<(OwnedReadHalf, OwnedWriteHalf)> {
        let listeners = self.listeners.lock().await;
        let listener = listeners.get(scope).ok_or(LinkError::Closed)?;
        if listener.life.expired() {
            return Err(LinkError::Closed);
        }
        let mut sockets = self.sockets.lock().await;
        if sockets.get(id).is_none_or(|socket| socket.scope != scope) {
            return Err(LinkError::Invalid);
        }
        let socket = sockets.remove(id).ok_or(LinkError::Closed)?;
        let socket = Arc::try_unwrap(socket).map_err(|_| LinkError::Limit)?;
        Ok((socket.reader.into_inner(), socket.writer.into_inner()))
    }

    pub(in crate::gui_terminal) async fn perform(
        self: &Arc<Self>,
        request: LinkRequest,
    ) -> Result<LinkReply> {
        match request {
            LinkRequest::UdpListen { port, version } => {
                super::udp::require_version(version)?;
                self.udp.listen(port).await
            }
            LinkRequest::UdpConnect {
                scope,
                url,
                version,
            } => {
                super::udp::require_version(version)?;
                self.udp.connect(scope, url).await
            }
            LinkRequest::UdpRead { scope, id } => self.udp.read(&scope, &id).await,
            LinkRequest::UdpWrite { scope, id, packets } => {
                self.udp.write(&scope, &id, packets).await
            }
            LinkRequest::UdpClose { scope, id } => self.udp.close(&scope, &id).await,
            LinkRequest::Listen { port } => self.listen(port).await,
            LinkRequest::Accept { scope } => self.accept(&scope).await,
            LinkRequest::Connect { scope, url } => {
                let destination = destination(&url)?;
                let stream = timeout(READ_WAIT, TcpStream::connect(destination))
                    .await
                    .map_err(|_| LinkError::Network)?
                    .map_err(|_| LinkError::Network)?;
                self.insert(scope, stream).await
            }
            LinkRequest::Read { scope, id } => read(self.get(&scope, &id).await?).await,
            LinkRequest::Write { scope, id, data } => {
                write(self.get(&scope, &id).await?, &data).await
            }
            LinkRequest::Close { scope, id } => {
                let mut sockets = self.sockets.lock().await;
                if sockets.get(&id).is_some_and(|socket| socket.scope == scope) {
                    if let Some(socket) = sockets.remove(&id) {
                        socket.life.cancel.send_replace(true);
                    }
                }
                Ok(LinkReply::Done)
            }
            LinkRequest::Stop { scope } => {
                self.stop(&scope).await;
                Ok(LinkReply::Done)
            }
        }
    }

    async fn get(&self, scope: &str, id: &str) -> Result<Arc<Socket>> {
        let socket = self
            .sockets
            .lock()
            .await
            .get(id)
            .cloned()
            .ok_or(LinkError::Closed)?;
        if socket.scope != scope || socket.life.expired() {
            return Err(LinkError::Closed);
        }
        socket.life.touch();
        Ok(socket)
    }

    async fn insert(self: &Arc<Self>, scope: String, stream: TcpStream) -> Result<LinkReply> {
        stream.set_nodelay(true).map_err(|_| LinkError::Network)?;
        let mut sockets = self.sockets.lock().await;
        if sockets.len() >= MAX_SOCKETS {
            return Err(LinkError::Limit);
        }
        let id = uuid::Uuid::new_v4().to_string();
        let (reader, writer) = stream.into_split();
        sockets.insert(
            id.clone(),
            Arc::new(Socket {
                scope,
                reader: Mutex::new(reader),
                writer: Mutex::new(writer),
                life: Lifetime::new(),
            }),
        );
        self.watch(id.clone(), false);
        Ok(LinkReply::Socket { id })
    }

    async fn listen(self: &Arc<Self>, port: Option<u16>) -> Result<LinkReply> {
        if port == Some(0) {
            return Err(LinkError::Invalid);
        }
        let socket = TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, port.unwrap_or(0)))
            .await
            .map_err(|error| match error.kind() {
                std::io::ErrorKind::AddrInUse => LinkError::PortInUse,
                _ => LinkError::Listen,
            })?;
        let port = socket.local_addr().map_err(|_| LinkError::Network)?.port();
        let mut listeners = self.listeners.lock().await;
        if listeners.len() >= MAX_LISTENERS {
            return Err(LinkError::Limit);
        }
        let id = uuid::Uuid::new_v4().to_string();
        listeners.insert(
            id.clone(),
            Arc::new(Listener {
                socket: Mutex::new(Some(socket)),
                life: Lifetime::new(),
            }),
        );
        self.watch(id.clone(), true);
        Ok(LinkReply::Listener { id, port })
    }

    async fn accept(self: &Arc<Self>, scope: &str) -> Result<LinkReply> {
        let listener = self
            .listeners
            .lock()
            .await
            .get(scope)
            .cloned()
            .ok_or(LinkError::Closed)?;
        if listener.life.expired() {
            return Err(LinkError::Closed);
        }
        listener.life.touch();
        let mut canceled = listener.life.cancel.subscribe();
        let socket = listener.socket.lock().await;
        let socket = socket.as_ref().ok_or(LinkError::Closed)?;
        if *canceled.borrow() {
            return Err(LinkError::Closed);
        }
        let accepted = tokio::select! {
            _ = canceled.changed() => return Err(LinkError::Closed),
            accepted = timeout(READ_WAIT, socket.accept()) => accepted,
        };
        let Ok(accepted) = accepted else {
            return Ok(LinkReply::Done);
        };
        let (stream, source) = accepted.map_err(|_| LinkError::Network)?;
        if !source.ip().is_loopback() {
            return Err(LinkError::Invalid);
        }
        self.insert(scope.into(), stream).await
    }

    async fn stop(&self, scope: &str) {
        self.udp.stop(scope).await;
        let listener = self.listeners.lock().await.remove(scope);
        if let Some(listener) = listener {
            listener.life.cancel.send_replace(true);
            // Release the bound port before replying, including when an accept is still in flight.
            listener.socket.lock().await.take();
        }
        self.sockets.lock().await.retain(|_, socket| {
            if socket.scope != scope {
                return true;
            }
            socket.life.cancel.send_replace(true);
            false
        });
    }

    fn watch(self: &Arc<Self>, id: String, listener: bool) {
        let state = Arc::downgrade(self);
        tauri::async_runtime::spawn(async move {
            loop {
                tokio::time::sleep(Duration::from_secs(15)).await;
                let Some(state) = state.upgrade() else { return };
                if state.expire(&id, listener).await {
                    return;
                }
            }
        });
    }

    async fn expire(&self, id: &str, listener: bool) -> bool {
        if listener {
            let expired = self
                .listeners
                .lock()
                .await
                .get(id)
                .map(|entry| entry.life.expired());
            if expired == Some(false) {
                return false;
            }
            self.stop(id).await;
            return true;
        }
        let mut sockets = self.sockets.lock().await;
        if sockets.get(id).is_some_and(|entry| !entry.life.expired()) {
            return false;
        }
        if let Some(socket) = sockets.remove(id) {
            socket.life.cancel.send_replace(true);
        }
        true
    }
}

async fn read(socket: Arc<Socket>) -> Result<LinkReply> {
    let mut reader = socket.reader.try_lock().map_err(|_| LinkError::Limit)?;
    let mut canceled = socket.life.cancel.subscribe();
    let mut buffer = vec![0; CHUNK_BYTES];
    let result = tokio::select! {
        _ = canceled.changed() => return Err(LinkError::Closed),
        result = timeout(READ_WAIT, reader.read(&mut buffer)) => result,
    };
    let count = match result {
        Err(_) => {
            return Ok(LinkReply::Data {
                data: String::new(),
                eof: false,
            })
        }
        Ok(Err(_)) => return Err(LinkError::Network),
        Ok(Ok(count)) => count,
    };
    let count = drain_available(&reader, &mut buffer, count);
    Ok(LinkReply::Data {
        data: STANDARD.encode(&buffer[..count]),
        eof: count == 0,
    })
}

fn drain_available(reader: &OwnedReadHalf, buffer: &mut [u8], mut count: usize) -> usize {
    // Drain only bytes already available. Waiting to fill a larger chunk delays small HTTP replies and WebSockets.
    while count > 0 && count < buffer.len() {
        match reader.try_read(&mut buffer[count..]) {
            Ok(0) => break,
            Ok(bytes) => count += bytes,
            Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => break,
            // Deliver the bytes already read before surfacing a reset on the following request.
            Err(_) => break,
        }
    }
    count
}

async fn write(socket: Arc<Socket>, data: &str) -> Result<LinkReply> {
    if data.len() > CHUNK_BYTES * 4 / 3 {
        return Err(LinkError::Invalid);
    }
    let bytes = STANDARD.decode(data).map_err(|_| LinkError::Invalid)?;
    let mut writer = socket.writer.lock().await;
    let mut canceled = socket.life.cancel.subscribe();
    tokio::select! {
        _ = canceled.changed() => return Err(LinkError::Closed),
        result = timeout(READ_WAIT, writer.write_all(&bytes)) => {
            result.map_err(|_| LinkError::Network)?.map_err(|_| LinkError::Network)?;
        }
    }
    Ok(LinkReply::Done)
}
