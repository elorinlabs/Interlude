use super::{Error, Result, BATCH_BYTES, MAX_POSITION, MAX_RECORD_BYTES, WINDOW_BYTES};
use std::collections::BTreeMap;

const MAX_FRAGMENTS: usize = 4096;
const HEADER_BYTES: usize = 9;
const FRAME_BYTES: usize = MAX_RECORD_BYTES - 72 - 16;

/// Scheduled bytes include the single in-flight write and cannot replenish credit until committed.
#[derive(Default)]
pub(super) struct Buffer {
    pending: BTreeMap<u64, Vec<u8>>,
    scheduled: u64,
    end: Option<u64>,
    pub consumed: u64,
}
impl Buffer {
    pub fn eof(&self) -> bool {
        self.end == Some(self.consumed)
    }
    pub fn take_ready(&self) -> bool {
        self.pending.contains_key(&self.scheduled)
    }

    pub fn receive(&mut self, frame: &[u8]) -> Result<()> {
        if !(HEADER_BYTES..=FRAME_BYTES).contains(&frame.len()) {
            return Err(Error::Invalid);
        }
        let offset = u64::from_be_bytes(frame[1..9].try_into().map_err(|_| Error::Invalid)?);
        if offset > MAX_POSITION {
            return Err(Error::Invalid);
        }
        match frame[0] {
            1 => self.insert(offset, &frame[HEADER_BYTES..]),
            4 if frame.len() == HEADER_BYTES => self.finish(offset),
            _ => Err(Error::Invalid),
        }
    }

    fn insert(&mut self, offset: u64, bytes: &[u8]) -> Result<()> {
        let end = offset + bytes.len() as u64;
        if bytes.is_empty()
            || end > MAX_POSITION
            || end > self.consumed + WINDOW_BYTES
            || self.end.is_some_and(|value| end > value)
        {
            return Err(Error::Invalid);
        }
        let mut cursor = offset.max(self.scheduled);
        let mut gaps = Vec::new();
        for (&start, value) in self.pending.range(..end) {
            if cursor >= end {
                break;
            }
            if start > cursor {
                gaps.push((
                    cursor,
                    bytes[(cursor - offset) as usize..(start - offset) as usize].to_vec(),
                ));
            }
            cursor = cursor.max(start + value.len() as u64);
        }
        if cursor < end {
            gaps.push((cursor, bytes[(cursor - offset) as usize..].to_vec()));
        }
        if self.pending.len() + gaps.len() > MAX_FRAGMENTS {
            return Err(Error::Limit);
        }
        self.pending.extend(gaps);
        Ok(())
    }

    fn finish(&mut self, offset: u64) -> Result<()> {
        if offset < self.scheduled
            || offset > self.consumed + WINDOW_BYTES
            || self.end.is_some_and(|end| end != offset)
            || self
                .pending
                .last_key_value()
                .is_some_and(|(&start, bytes)| start + bytes.len() as u64 > offset)
        {
            return Err(Error::Invalid);
        }
        self.end = Some(offset);
        Ok(())
    }

    pub fn take(&mut self) -> Result<Option<Vec<u8>>> {
        if self.scheduled != self.consumed {
            return Err(Error::Invalid);
        }
        let mut batch = Vec::new();
        while let Some(bytes) = self.pending.get(&self.scheduled) {
            if batch.len() + bytes.len() > BATCH_BYTES {
                break;
            }
            let bytes = self.pending.remove(&self.scheduled).ok_or(Error::Invalid)?;
            self.scheduled += bytes.len() as u64;
            batch.extend(bytes);
        }
        Ok((!batch.is_empty()).then_some(batch))
    }

    pub fn written(&mut self, bytes: usize) -> Result<()> {
        if self.consumed + bytes as u64 != self.scheduled {
            return Err(Error::Invalid);
        }
        self.consumed = self.scheduled;
        Ok(())
    }
}
