//! Bounded mobile IPC; ciphertext stays binary on the network in both directions.
use base64::{engine::general_purpose::STANDARD, Engine};
use serde_json::{json, Value};
use std::time::Duration;

use crate::{Error, Result};

const MAX_ENCODED_BYTES: usize = 192 * 1024;
const POLL_RECORDS: usize = 8;

pub(super) fn send_encoded(owner: &str, id: &str, generation: u64, data: &str) -> Result<()> {
    if data.len() > MAX_ENCODED_BYTES {
        return Err(Error::Invalid);
    }
    send(
        owner,
        id,
        generation,
        STANDARD.decode(data).map_err(|_| Error::Invalid)?,
    )
}

pub(crate) fn send(owner: &str, id: &str, generation: u64, bytes: Vec<u8>) -> Result<()> {
    let hub = super::hub()?;
    let connection = super::owned_connection(hub, id, owner)?;
    hub.runtime
        .block_on(connection.send_bulk(generation, bytes))
}

pub(super) fn poll(owner: &str, id: &str) -> Result<Value> {
    let hub = super::hub()?;
    let connection = super::owned_connection(hub, id, owner)?;
    hub.runtime.block_on(async {
        let mut records = Vec::new();
        for index in 0..POLL_RECORDS {
            let delay = if index == 0 { 250 } else { 1 };
            match tokio::time::timeout(Duration::from_millis(delay), connection.receive_bulk())
                .await
            {
                Ok(Some(record)) => records.push(STANDARD.encode(record)),
                Ok(None) => return Err(Error::Closed),
                Err(_) => break,
            }
        }
        Ok(json!(records))
    })
}
