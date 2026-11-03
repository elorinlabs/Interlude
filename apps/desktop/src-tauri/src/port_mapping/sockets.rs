use super::{lock, Error, Result, State, BATCH_BYTES, MAX_SOCKETS};
use std::{
    sync::{atomic::Ordering, Arc, Mutex},
    time::{Duration, Instant},
};
use tokio::{
    io::AsyncReadExt,
    net::tcp::{OwnedReadHalf, OwnedWriteHalf},
    sync::{watch, Mutex as AsyncMutex},
};

const READ_WAIT: Duration = Duration::from_secs(10);
const IDLE_TIMEOUT: Duration = Duration::from_secs(90);

pub(super) struct Socket {
    reader: AsyncMutex<OwnedReadHalf>,
    pub writer: Mutex<Option<OwnedWriteHalf>>,
    pub cancel: watch::Sender<bool>,
    touched: Mutex<Instant>,
}
impl Socket {
    pub fn close(&self) -> bool {
        !self.cancel.send_replace(true)
    }
    pub fn closed(&self) -> bool {
        *self.cancel.borrow() || lock(&self.touched).map_or(true, |at| at.elapsed() > IDLE_TIMEOUT)
    }
    async fn read(&self) -> Result<Vec<u8>> {
        *lock(&self.touched)? = Instant::now();
        let mut reader = self.reader.try_lock().map_err(|_| Error::Limit)?;
        let mut cancel = self.cancel.subscribe();
        if *cancel.borrow() {
            return Err(Error::Closed);
        }
        let mut bytes = vec![0; BATCH_BYTES + 1];
        let count = tokio::select! {
            _ = cancel.changed() => return Err(Error::Closed),
            read = tokio::time::timeout(READ_WAIT, reader.read(&mut bytes[1..])) => match read {
                Err(_) => return Ok(vec![0]),
                Ok(result) => result.map_err(|_| Error::Closed)?,
            }
        };
        bytes[0] = u8::from(count == 0);
        bytes.truncate(count + 1);
        Ok(bytes)
    }
}
impl Drop for Socket {
    fn drop(&mut self) {
        self.close();
    }
}

impl State {
    pub fn attach(&self, halves: (OwnedReadHalf, OwnedWriteHalf)) -> Result<u32> {
        let mut sockets = lock(&self.sockets)?;
        if sockets.len() >= MAX_SOCKETS {
            return Err(Error::Limit);
        }
        let id = self
            .next_socket
            .try_update(Ordering::Relaxed, Ordering::Relaxed, |id| id.checked_add(1))
            .map_err(|_| Error::Limit)?
            + 1;
        sockets.insert(
            id,
            Arc::new(Socket {
                reader: AsyncMutex::new(halves.0),
                writer: Mutex::new(Some(halves.1)),
                cancel: watch::channel(false).0,
                touched: Mutex::new(Instant::now()),
            }),
        );
        Ok(id)
    }

    pub(super) fn socket(&self, id: u32) -> Result<Arc<Socket>> {
        lock(&self.sockets)?
            .get(&id)
            .cloned()
            .filter(|socket| !socket.closed())
            .ok_or(Error::Closed)
    }

    pub async fn read(&self, id: u32) -> Result<Vec<u8>> {
        self.socket(id)?.read().await
    }

    pub fn close_socket(&self, id: u32) -> Result<()> {
        if let Some(socket) = lock(&self.sockets)?.remove(&id) {
            socket.close();
        }
        Ok(())
    }
}
