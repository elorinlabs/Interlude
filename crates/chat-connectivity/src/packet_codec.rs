//! Stateless packet compression. Call only from native blocking workers.
use base64::{engine::general_purpose::STANDARD, Engine};
use flate2::{Compress, Compression, Decompress, FlushCompress, FlushDecompress, Status};
use serde::Deserialize;

/// Matches the encrypted chat packet limit after its nonce and authentication tag.
pub const MAX_PLAIN_BYTES: usize = 20_000 - 12 - 16;
const MAX_ENCODED_BYTES: usize = 4 * MAX_PLAIN_BYTES.div_ceil(3);
const MIN_COMPRESSION_BYTES: usize = 256;
const MIN_SAVING_BYTES: usize = 32;
const LENGTH_BYTES: usize = 2;

/// Native combined pipelines keep bytes off the JS bridge. `None` preserves the legacy plaintext packet.
pub fn encode_packet(bytes: &[u8]) -> Result<Option<Vec<u8>>, CodecError> {
    if bytes.len() > MAX_PLAIN_BYTES {
        return Err(CodecError);
    }
    if bytes.len() < MIN_COMPRESSION_BYTES {
        return Ok(None);
    }
    let compressed = compress(bytes)?;
    let size = LENGTH_BYTES + compressed.len();
    // Integer arithmetic exactly implements the shared 32-byte AND 10% saving policy.
    if size + MIN_SAVING_BYTES > bytes.len() || size * 10 > bytes.len() * 9 {
        return Ok(None);
    }
    let mut packet = Vec::with_capacity(size);
    packet.extend_from_slice(&(bytes.len() as u16).to_be_bytes());
    packet.extend_from_slice(&compressed);
    Ok(Some(packet))
}

/// Decode only after AEAD authentication. Bound both the encoded packet and its declared output size.
pub fn decode_packet(packet: &[u8]) -> Result<Vec<u8>, CodecError> {
    if packet.len() <= LENGTH_BYTES || packet.len() > MAX_PLAIN_BYTES {
        return Err(CodecError);
    }
    let length = u16::from_be_bytes([packet[0], packet[1]]) as usize;
    if length < MIN_COMPRESSION_BYTES {
        return Err(CodecError);
    }
    decompress(&packet[LENGTH_BYTES..], length)
}

/// Bounded byte input for the desktop IPC and mobile JSON ABI.
#[derive(Deserialize)]
#[serde(tag = "action", rename_all = "kebab-case")]
pub enum Request {
    Compress { data: String },
    Decompress { data: String, length: usize },
}

/// Do not include packet contents or native diagnostics in frontend errors.
#[derive(Debug, thiserror::Error)]
#[error("Invalid chat packet codec request")]
pub struct CodecError;

/// Transforms one bounded packet; Base64 is confined to IPC and never added to the network packet.
pub fn transform(request: Request) -> Result<String, CodecError> {
    let (data, length) = match request {
        Request::Compress { data } => (data, None),
        Request::Decompress { data, length } => (data, Some(length)),
    };
    if data.len() > MAX_ENCODED_BYTES {
        return Err(CodecError);
    }
    let bytes = STANDARD.decode(data).map_err(|_| CodecError)?;
    if bytes.len() > MAX_PLAIN_BYTES {
        return Err(CodecError);
    }
    let output = match length {
        Some(length) => decompress(&bytes, length)?,
        None => compress(&bytes)?,
    };
    Ok(STANDARD.encode(output))
}

fn compress(bytes: &[u8]) -> Result<Vec<u8>, CodecError> {
    // Incompressible input can grow slightly; the sender compares the complete encoded size.
    let mut output = vec![0; MAX_PLAIN_BYTES + 128];
    let mut codec = Compress::new(Compression::fast(), false);
    let status = codec
        .compress(bytes, &mut output, FlushCompress::Finish)
        .map_err(|_| CodecError)?;
    if status != Status::StreamEnd || codec.total_in() != bytes.len() as u64 {
        return Err(CodecError);
    }
    output.truncate(codec.total_out() as usize);
    Ok(output)
}

fn decompress(bytes: &[u8], length: usize) -> Result<Vec<u8>, CodecError> {
    if length == 0 || length > MAX_PLAIN_BYTES {
        return Err(CodecError);
    }
    // One sentinel byte detects a lying original length without an unbounded allocation.
    let mut output = vec![0; length + 1];
    let mut codec = Decompress::new(false);
    let status = codec
        .decompress(bytes, &mut output, FlushDecompress::Finish)
        .map_err(|_| CodecError)?;
    if status != Status::StreamEnd
        || codec.total_in() != bytes.len() as u64
        || codec.total_out() != length as u64
    {
        return Err(CodecError);
    }
    output.truncate(length);
    Ok(output)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trips_unicode_and_maximum_sized_packets() {
        for bytes in [
            "中文😀\0".repeat(100).into_bytes(),
            vec![b'x'; MAX_PLAIN_BYTES],
        ] {
            let encoded = compress(&bytes).unwrap();
            assert!(encoded.len() < bytes.len());
            assert_eq!(decompress(&encoded, bytes.len()).unwrap(), bytes);
        }
    }

    #[test]
    fn rejects_wrong_lengths_truncation_trailing_bytes_and_expansion() {
        let bytes = vec![b'x'; MAX_PLAIN_BYTES];
        let encoded = compress(&bytes).unwrap();
        for length in [0, 1, MAX_PLAIN_BYTES - 1, MAX_PLAIN_BYTES + 1, usize::MAX] {
            assert!(decompress(&encoded, length).is_err());
        }
        assert!(decompress(&encoded[..encoded.len() - 1], bytes.len()).is_err());
        let mut extra = encoded;
        extra.push(0);
        assert!(decompress(&extra, bytes.len()).is_err());
    }

    #[test]
    fn validates_the_ipc_input_before_decoding() {
        for data in ["!".into(), STANDARD.encode(vec![0; MAX_PLAIN_BYTES + 1])] {
            assert!(transform(Request::Compress { data }).is_err());
        }
    }

    #[test]
    fn native_packet_policy_preserves_short_and_incompressible_data() {
        assert!(encode_packet(&[b'x'; 255]).unwrap().is_none());
        assert!(encode_packet(&vec![0; MAX_PLAIN_BYTES + 1]).is_err());
        let noise: Vec<_> = (0..256).map(|value| value as u8).collect();
        assert!(encode_packet(&noise).unwrap().is_none());
        for bytes in [
            vec![b'x'; 256],
            "中文😀\0".repeat(500).into_bytes(),
            vec![b'x'; MAX_PLAIN_BYTES],
        ] {
            let packet = encode_packet(&bytes).unwrap().unwrap();
            assert!(packet.len() + MIN_SAVING_BYTES <= bytes.len());
            assert!(packet.len() * 10 <= bytes.len() * 9);
            assert_eq!(&packet[..2], &(bytes.len() as u16).to_be_bytes());
            assert_eq!(decode_packet(&packet).unwrap(), bytes);
        }
    }

    #[test]
    fn native_packet_decoder_rejects_bad_lengths_streams_and_trailing_data() {
        let packet = encode_packet(&vec![b'x'; 1000]).unwrap().unwrap();
        for length in [0_u16, 255, 999, 1001, u16::MAX] {
            let mut invalid = packet.clone();
            invalid[..2].copy_from_slice(&length.to_be_bytes());
            assert!(decode_packet(&invalid).is_err());
        }
        assert!(decode_packet(&packet[..packet.len() - 1]).is_err());
        let mut trailing = packet;
        trailing.push(0);
        assert!(decode_packet(&trailing).is_err());
        assert!(decode_packet(&[0, 1]).is_err());
        assert!(decode_packet(&vec![0; MAX_PLAIN_BYTES + 1]).is_err());
    }
}
