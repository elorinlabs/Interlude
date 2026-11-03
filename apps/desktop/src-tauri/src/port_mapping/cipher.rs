use super::{Error, Result, MAX_RECORD_BYTES};
use chacha20poly1305::{
    aead::{Aead, KeyInit, Payload},
    ChaCha20Poly1305, Nonce,
};
use uuid::Uuid;

const HEADER_BYTES: usize = 72;
const TAG_BYTES: usize = 16;
const REPLAY_WINDOW: usize = 4096;

pub(super) struct Cipher {
    cipher: ChaCha20Poly1305,
    transfer: Uuid,
    epoch: Uuid,
    received: Box<[u32; REPLAY_WINDOW]>,
    highest: u32,
}

impl Cipher {
    pub fn new(transfer: Uuid, epoch: Uuid, key: &[u8]) -> Result<Self> {
        Ok(Self {
            cipher: ChaCha20Poly1305::new_from_slice(key).map_err(|_| Error::Invalid)?,
            transfer,
            epoch,
            received: Box::new([0; REPLAY_WINDOW]),
            highest: 0,
        })
    }

    pub fn decrypt(&mut self, record: &[u8]) -> Result<Option<(Uuid, Vec<u8>)>> {
        if !(HEADER_BYTES + TAG_BYTES + 1..=MAX_RECORD_BYTES).contains(&record.len())
            || &record[..8] != b"RAB1\x01\x01\x00\x48"
            || &record[8..24] != self.transfer.as_bytes()
        {
            return Err(Error::Invalid);
        }
        // Stale epochs can arrive after a reconnect; they cannot allocate or write into this receiver.
        if &record[24..40] != self.epoch.as_bytes() {
            return Ok(None);
        }
        let id = Uuid::from_slice(&record[40..56]).map_err(|_| Error::Invalid)?;
        let integer = |start| -> Result<u32> {
            Ok(u32::from_be_bytes(
                record[start..start + 4]
                    .try_into()
                    .map_err(|_| Error::Invalid)?,
            ))
        };
        let offset = u64::from(integer(60)?);
        let length = integer(64)? as usize;
        let sequence = integer(68)?;
        if sequence == 0
            || length == 0
            || offset + length as u64 > 1024 * 1024
            || HEADER_BYTES + length + TAG_BYTES != record.len()
        {
            return Err(Error::Invalid);
        }
        let slot = sequence as usize % REPLAY_WINDOW;
        if self.received[slot] == sequence
            || sequence <= self.highest.saturating_sub(REPLAY_WINDOW as u32)
        {
            return Ok(None);
        }
        let mut nonce = [0; 12];
        nonce[8..].copy_from_slice(&sequence.to_be_bytes());
        let bytes = self
            .cipher
            .decrypt(
                Nonce::from_slice(&nonce),
                Payload {
                    msg: &record[HEADER_BYTES..],
                    aad: &record[..HEADER_BYTES],
                },
            )
            .map_err(|_| Error::Invalid)?;
        self.received[slot] = sequence;
        self.highest = self.highest.max(sequence);
        Ok(Some((id, bytes)))
    }
}
