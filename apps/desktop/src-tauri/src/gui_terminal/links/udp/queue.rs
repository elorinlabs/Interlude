use super::{
    Datagram, LinkError, Result, MAX_BATCH, MAX_BATCH_BYTES, QUEUE_BYTES, QUEUE_SIZE, READ_WAIT,
};
use std::sync::Arc;
use tokio::sync::{mpsc, watch, OwnedSemaphorePermit, Semaphore};

pub(super) struct Queued {
    pub packet: Datagram,
    _memory: OwnedSemaphorePermit,
}

#[derive(Clone)]
pub(super) struct Sender {
    channel: mpsc::Sender<Queued>,
    memory: Arc<Semaphore>,
}

pub(super) fn channel() -> (Sender, mpsc::Receiver<Queued>) {
    let (channel, receiver) = mpsc::channel(QUEUE_SIZE);
    (
        Sender {
            channel,
            memory: Arc::new(Semaphore::new(QUEUE_BYTES)),
        },
        receiver,
    )
}

impl Sender {
    pub fn closed(&self) -> bool {
        self.channel.is_closed()
    }

    /// Bound both packet count and payload memory, including packets waiting for a socket write.
    pub fn push(&self, packet: Datagram) -> bool {
        let Ok(memory) = self
            .memory
            .clone()
            .try_acquire_many_owned(packet.data.len().max(1) as u32)
        else {
            return false;
        };
        self.channel
            .try_send(Queued {
                packet,
                _memory: memory,
            })
            .is_ok()
    }
}

pub(super) struct Reader {
    channel: mpsc::Receiver<Queued>,
    pending: Option<Queued>,
}

impl Reader {
    pub fn new(channel: mpsc::Receiver<Queued>) -> Self {
        Self {
            channel,
            pending: None,
        }
    }

    pub async fn read(&mut self, cancel: &mut watch::Receiver<bool>) -> Result<Vec<Datagram>> {
        let first = if let Some(packet) = self.pending.take() {
            Some(packet)
        } else {
            tokio::select! {
                _ = cancel.changed() => return Err(LinkError::Closed),
                result = tokio::time::timeout(READ_WAIT, self.channel.recv()) => match result {
                    Ok(Some(packet)) => Some(packet),
                    Ok(None) => return Err(LinkError::Closed),
                    Err(_) => None,
                }
            }
        };
        let mut packets = Vec::new();
        let mut bytes = 0;
        if let Some(first) = first {
            bytes = first.packet.data.len();
            packets.push(first.packet);
        }
        while packets.len() < MAX_BATCH {
            let Ok(next) = self.channel.try_recv() else {
                break;
            };
            if bytes + next.packet.data.len() > MAX_BATCH_BYTES {
                self.pending = Some(next);
                break;
            }
            bytes += next.packet.data.len();
            packets.push(next.packet);
        }
        Ok(packets)
    }
}
