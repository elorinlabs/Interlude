use super::authority::AUTH_PROTOCOL;
use crate::{Error, Result};
use tokio::io::{AsyncRead, AsyncReadExt};
use zeroize::Zeroizing;

const HEADER_BYTES: usize = 12;
const COOKIE_BYTES: usize = 16;

/// Verify the session-only cookie before any bytes reach the local X server.
pub(super) async fn setup(
    stream: &mut (impl AsyncRead + Unpin),
    fake: &[u8; COOKIE_BYTES],
    real: &[u8],
) -> Result<Zeroizing<Vec<u8>>> {
    let mut header = [0; HEADER_BYTES];
    stream
        .read_exact(&mut header)
        .await
        .map_err(|_| Error::X11Rejected)?;
    let little = validate_header(&header)?;
    let name_length = padded(AUTH_PROTOCOL.len());
    let mut payload = Zeroizing::new(vec![0; name_length + COOKIE_BYTES]);
    stream
        .read_exact(&mut payload)
        .await
        .map_err(|_| Error::X11Rejected)?;
    let matches = payload[name_length..]
        .iter()
        .zip(fake)
        .fold(0u8, |difference, (a, b)| difference | (a ^ b));
    if &payload[..AUTH_PROTOCOL.len()] != AUTH_PROTOCOL || matches != 0 {
        return Err(Error::X11Rejected);
    }
    Ok(replace_auth(header, little, real))
}

fn validate_header(header: &[u8; HEADER_BYTES]) -> Result<bool> {
    let little = match header[0] {
        b'l' => true,
        b'B' => false,
        _ => return Err(Error::X11Rejected),
    };
    let read = |offset| {
        let value = [header[offset], header[offset + 1]];
        if little {
            u16::from_le_bytes(value)
        } else {
            u16::from_be_bytes(value)
        }
    };
    if read(2) != 11
        || usize::from(read(6)) != AUTH_PROTOCOL.len()
        || usize::from(read(8)) != COOKIE_BYTES
    {
        return Err(Error::X11Rejected);
    }
    Ok(little)
}

fn replace_auth(mut header: [u8; HEADER_BYTES], little: bool, real: &[u8]) -> Zeroizing<Vec<u8>> {
    let protocol = if real.is_empty() {
        &[][..]
    } else {
        AUTH_PROTOCOL
    };
    header[6..8].copy_from_slice(&word(protocol.len(), little));
    header[8..10].copy_from_slice(&word(real.len(), little));
    let mut packet = Zeroizing::new(header.to_vec());
    packet.extend_from_slice(protocol);
    packet.resize(HEADER_BYTES + padded(protocol.len()), 0);
    packet.extend_from_slice(real);
    packet.resize(
        HEADER_BYTES + padded(protocol.len()) + padded(real.len()),
        0,
    );
    packet
}

fn padded(length: usize) -> usize {
    (length + 3) & !3
}
fn word(value: usize, little: bool) -> [u8; 2] {
    if little {
        (value as u16).to_le_bytes()
    } else {
        (value as u16).to_be_bytes()
    }
}
