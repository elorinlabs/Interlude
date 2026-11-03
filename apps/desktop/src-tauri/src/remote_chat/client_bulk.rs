//! Bounded raw IPC for relay downloads. File bytes never enter the JSON chat bridge.
use std::{collections::VecDeque, time::Instant};

use tauri::ipc::{Channel, Response};

use super::{bulk, ipc_ack::PendingAck, protocol::ChatError};

const MAX_FRAME_BYTES: usize = 16 * 1024 + 5 + 128;
const MAX_BUFFER_BYTES: usize = 4 * 1024 * 1024;
const MAX_QUEUED_RECORDS: usize = 256;
const MAX_BATCH_RECORDS: usize = 16;
const BATCH_HEADER_BYTES: usize = 9;

pub(super) struct ClientBulk {
    port_streams: Option<std::sync::Arc<crate::port_mapping::State>>,
    channel: Option<Channel<Response>>,
    enabled: bool,
    queue: VecDeque<Vec<u8>>,
    buffered: usize,
    sequence: u32,
    pending: usize,
    acknowledgement: PendingAck,
}

impl ClientBulk {
    pub fn new(channel: Option<Channel<Response>>) -> Self {
        Self {
            port_streams: None,
            channel,
            enabled: false,
            queue: VecDeque::new(),
            buffered: 0,
            sequence: 0,
            pending: 0,
            acknowledgement: PendingAck::default(),
        }
    }

    pub fn negotiate(&mut self, enabled: bool) {
        self.enabled = enabled && self.channel.is_some();
    }

    pub fn with_port_streams(
        mut self,
        streams: std::sync::Arc<crate::port_mapping::State>,
    ) -> Self {
        self.port_streams = Some(streams);
        self
    }

    pub fn enabled(&self) -> bool {
        self.enabled
    }

    pub fn clear(&mut self) {
        self.queue.clear();
        self.buffered = 0;
        self.pending = 0;
        self.acknowledgement.clear();
        self.enabled = false;
    }

    /// Leave room for one maximum record before reading another socket frame.
    pub fn has_capacity(&self) -> bool {
        self.buffered <= MAX_BUFFER_BYTES - MAX_FRAME_BYTES && self.queue.len() < MAX_QUEUED_RECORDS
    }

    pub fn enqueue(&mut self, bytes: Vec<u8>, session: Option<&str>) -> Result<(), ChatError> {
        if !self.enabled || session != Some(bulk::session_id(&bytes)?.as_str()) {
            return Err(ChatError::InvalidFrame);
        }
        let offset = 5 + usize::from(bytes[4]);
        if self
            .port_streams
            .as_ref()
            .is_some_and(|streams| streams.route(&bytes[offset..]))
        {
            return Ok(());
        }
        if self.buffered + bytes.len() > MAX_BUFFER_BYTES || self.queue.len() >= MAX_QUEUED_RECORDS
        {
            return Err(ChatError::Transport);
        }
        self.buffered += bytes.len();
        self.queue.push_back(bytes);
        Ok(())
    }

    pub fn acknowledge(&mut self, sequence: u64) {
        if sequence == u64::from(self.sequence) {
            self.buffered -= self.pending;
            self.pending = 0;
            self.acknowledgement.clear();
        }
    }

    /// A single acknowledged batch bounds callbacks even while the renderer is suspended.
    pub fn flush(&mut self) -> Result<(), ChatError> {
        if self.pending != 0 || self.queue.is_empty() {
            return Ok(());
        }
        let channel = self.channel.as_ref().ok_or(ChatError::Transport)?;
        self.sequence = self.sequence.checked_add(1).ok_or(ChatError::Transport)?;
        let count = self.queue.len().min(MAX_BATCH_RECORDS);
        let length: usize = self.queue.iter().take(count).map(Vec::len).sum();
        let mut batch = Vec::with_capacity(BATCH_HEADER_BYTES + count * 4 + length);
        batch.extend_from_slice(b"CGR1");
        batch.extend_from_slice(&self.sequence.to_be_bytes());
        batch.push(count as u8);
        for frame in self.queue.drain(..count) {
            batch.extend_from_slice(&(frame.len() as u32).to_be_bytes());
            batch.extend_from_slice(&frame);
        }
        self.pending = length;
        self.acknowledgement.sent();
        channel
            .send(Response::new(batch))
            .map_err(|_| ChatError::Transport)
    }

    pub fn stalled(&self, now: Instant) -> bool {
        self.acknowledgement.expired(now)
    }
}

#[cfg(test)]
#[path = "client_bulk_tests.rs"]
mod tests;
