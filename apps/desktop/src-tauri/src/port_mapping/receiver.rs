use super::{buffer::Buffer, cipher::Cipher, lock, sockets::Socket, Error, Result, MAX_SOCKETS};
use serde::Serialize;
use std::{
    collections::{HashMap, VecDeque},
    sync::{Arc, Mutex, Weak},
    time::{Duration, Instant},
};
use tokio::{
    io::AsyncWriteExt,
    net::tcp::OwnedWriteHalf,
    sync::{Mutex as AsyncMutex, Notify},
};
use uuid::Uuid;

const MAX_CONTROL_BYTES: usize = 4 * 1024 * 1024;
const MAX_CONTROL_RECORDS: usize = 256;
const POLL_RECORDS: usize = 16;
const POLL_WAIT: Duration = Duration::from_millis(250);
const WRITE_TIMEOUT: Duration = Duration::from_secs(30);
const LEASE_TIMEOUT: Duration = Duration::from_secs(30);
const RETIRED_STREAMS: usize = 4096;

#[derive(Clone, Copy, Serialize)]
pub(super) struct Progress {
    consumed: u64,
    eof: bool,
    failed: bool,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Record {
    request_id: String,
    data: Vec<u8>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Update {
    request_id: String,
    #[serde(flatten)]
    value: Progress,
}
#[derive(Default, Serialize)]
pub(crate) struct Poll {
    records: Vec<Record>,
    progress: Vec<Update>,
}
#[derive(Default)]
struct Events {
    records: VecDeque<Record>,
    bytes: usize,
    progress: HashMap<Uuid, Progress>,
}

pub(super) struct Receiver {
    cipher: Mutex<Option<Cipher>>,
    sinks: Mutex<HashMap<Uuid, Arc<Sink>>>,
    retired: Mutex<VecDeque<Uuid>>,
    events: Mutex<Events>,
    notify: Notify,
    polling: AsyncMutex<()>,
    touched: Mutex<Instant>,
}

impl Receiver {
    pub fn new(id: Uuid, epoch: Uuid, key: &[u8]) -> Result<Self> {
        Ok(Self {
            cipher: Mutex::new(Some(Cipher::new(id, epoch, key)?)),
            sinks: Mutex::default(),
            retired: Mutex::default(),
            events: Mutex::default(),
            notify: Notify::new(),
            polling: AsyncMutex::new(()),
            touched: Mutex::new(Instant::now()),
        })
    }
    pub fn expired(&self) -> bool {
        lock(&self.touched).map_or(true, |at| at.elapsed() > LEASE_TIMEOUT)
    }
    pub fn close(&self) {
        if let Ok(mut cipher) = lock(&self.cipher) {
            cipher.take();
        }
        if let Ok(mut sinks) = lock(&self.sinks) {
            for (_, sink) in sinks.drain() {
                sink.socket.close();
            }
        }
        if let Ok(mut events) = lock(&self.events) {
            *events = Events::default();
        }
        self.notify.notify_one();
    }

    pub fn bind(self: &Arc<Self>, id: Uuid, socket: Arc<Socket>) -> Result<()> {
        let cipher = lock(&self.cipher)?;
        if cipher.is_none() {
            return Err(Error::Closed);
        }
        let mut sinks = lock(&self.sinks)?;
        if sinks.len() >= MAX_SOCKETS || sinks.contains_key(&id) {
            return Err(Error::Limit);
        }
        let writer = lock(&socket.writer)?.take().ok_or(Error::Invalid)?;
        let sink = Arc::new(Sink {
            socket,
            buffer: Mutex::default(),
            notify: Notify::new(),
        });
        sinks.insert(id, sink.clone());
        let owner = Arc::downgrade(self);
        tauri::async_runtime::spawn(async move {
            sink.run(writer, owner, id).await;
        });
        Ok(())
    }
    pub fn unbind(&self, id: &Uuid) -> Result<()> {
        let mut sinks = lock(&self.sinks)?;
        if let Some(sink) = sinks.remove(id) {
            sink.socket.close();
        }
        // Late bytes from a closed TCP connection must not fill the control queue or fail its peers.
        let mut retired = lock(&self.retired)?;
        if !retired.contains(id) {
            if retired.len() == RETIRED_STREAMS {
                retired.pop_front();
            }
            retired.push_back(*id);
        }
        let mut events = lock(&self.events)?;
        events.progress.remove(id);
        let request_id = id.to_string();
        events
            .records
            .retain(|record| record.request_id != request_id);
        events.bytes = events.records.iter().map(|record| record.data.len()).sum();
        Ok(())
    }

    pub fn receive(&self, record: &[u8]) -> Result<()> {
        let decoded = lock(&self.cipher)?
            .as_mut()
            .ok_or(Error::Closed)?
            .decrypt(record)
            .map_err(|_| Error::Authentication)?;
        let Some((id, bytes)) = decoded else {
            return Ok(());
        };
        let sink = lock(&self.sinks)?.get(&id).cloned();
        if let Some(sink) = sink {
            if matches!(bytes.first(), Some(1 | 4)) {
                self.receive_payload(id, &sink, &bytes)?;
                return Ok(());
            }
        }
        if lock(&self.retired)?.contains(&id) {
            return Ok(());
        }
        let mut events = lock(&self.events)?;
        if events.records.len() >= MAX_CONTROL_RECORDS
            || events.bytes + bytes.len() > MAX_CONTROL_BYTES
        {
            return Err(Error::ControlQueue);
        }
        events.bytes += bytes.len();
        events.records.push_back(Record {
            request_id: id.to_string(),
            data: bytes,
        });
        self.notify.notify_one();
        Ok(())
    }

    fn receive_payload(&self, id: Uuid, sink: &Sink, bytes: &[u8]) -> Result<()> {
        if sink.socket.closed() {
            return Ok(());
        }
        let result = lock(&sink.buffer)?.receive(bytes);
        if result.is_ok() {
            sink.notify.notify_one();
        } else if sink.socket.close() {
            // An authenticated socket's invalid offsets must not terminate unrelated sockets or the cipher epoch.
            crate::error_logs::record_codex_error(
                "Port mapping socket stopped: invalid receive window",
            );
            self.progress(
                id,
                Progress {
                    consumed: 0,
                    eof: false,
                    failed: true,
                },
            )?;
        }
        Ok(())
    }

    fn progress(&self, id: Uuid, value: Progress) -> Result<()> {
        let sinks = lock(&self.sinks)?;
        let Some(sink) = sinks.get(&id) else {
            return Ok(());
        };
        if sink.socket.closed() && !value.failed {
            return Ok(());
        }
        lock(&self.events)?.progress.insert(id, value);
        self.notify.notify_one();
        Ok(())
    }

    pub async fn poll(&self) -> Result<Poll> {
        let _poll = self.polling.try_lock().map_err(|_| Error::Limit)?;
        *lock(&self.touched)? = Instant::now();
        // Coalesce socket completions. Payload bytes never cross this control poll.
        let _idle = tokio::time::timeout(POLL_WAIT, self.notify.notified()).await;
        tokio::time::sleep(Duration::from_millis(4)).await;
        if lock(&self.cipher)?.is_none() {
            return Err(Error::Closed);
        }
        let mut events = lock(&self.events)?;
        let count = events.records.len().min(POLL_RECORDS);
        let records: Vec<_> = events.records.drain(..count).collect();
        events.bytes -= records
            .iter()
            .map(|record| record.data.len())
            .sum::<usize>();
        let progress = events
            .progress
            .drain()
            .map(|(id, value)| Update {
                request_id: id.to_string(),
                value,
            })
            .collect();
        if !events.records.is_empty() {
            self.notify.notify_one();
        }
        Ok(Poll { records, progress })
    }
}
impl Drop for Receiver {
    fn drop(&mut self) {
        self.close();
    }
}

struct Sink {
    socket: Arc<Socket>,
    buffer: Mutex<Buffer>,
    notify: Notify,
}
impl Sink {
    async fn run(self: Arc<Self>, mut writer: OwnedWriteHalf, owner: Weak<Receiver>, id: Uuid) {
        let result = self.write_loop(&mut writer, &owner, id).await;
        if result.is_err() {
            self.socket.close();
            if let Some(owner) = owner.upgrade() {
                if let Err(error) = owner.progress(
                    id,
                    Progress {
                        consumed: 0,
                        eof: false,
                        failed: true,
                    },
                ) {
                    eprintln!("Port stream writer cleanup: {error}");
                }
            }
        }
    }
    async fn write_loop(
        &self,
        writer: &mut OwnedWriteHalf,
        owner: &Weak<Receiver>,
        id: Uuid,
    ) -> Result<()> {
        let mut cancel = self.socket.cancel.subscribe();
        loop {
            if *cancel.borrow() {
                return Err(Error::Closed);
            }
            let batch = lock(&self.buffer)?.take()?;
            if let Some(bytes) = batch {
                tokio::select! {
                    _ = cancel.changed() => return Err(Error::Closed),
                    result = tokio::time::timeout(WRITE_TIMEOUT, writer.write_all(&bytes)) => {
                        result.map_err(|_| Error::Closed)?.map_err(|_| Error::Closed)?;
                    }
                }
                lock(&self.buffer)?.written(bytes.len())?;
            }
            let progress = {
                let buffer = lock(&self.buffer)?;
                Progress {
                    consumed: buffer.consumed,
                    eof: buffer.eof(),
                    failed: false,
                }
            };
            owner
                .upgrade()
                .ok_or(Error::Closed)?
                .progress(id, progress)?;
            if progress.eof {
                writer.shutdown().await.map_err(|_| Error::Closed)?;
                return Ok(());
            }
            if lock(&self.buffer)?.take_ready() {
                continue;
            }
            tokio::select! { _ = cancel.changed() => return Err(Error::Closed), _ = self.notify.notified() => {} }
        }
    }
}
