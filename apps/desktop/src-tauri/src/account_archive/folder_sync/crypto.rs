use aes_gcm::{
    aead::{Aead, Payload},
    Aes256Gcm, KeyInit, Nonce,
};
use zeroize::Zeroizing;

const MAGIC: &[u8] = b"INTERLUDE-FOLDER-1";
pub(super) const MAX_BYTES: usize = 20 * 1024 * 1024;

pub(super) fn parse_key(value: &str) -> Result<Zeroizing<Vec<u8>>, String> {
    let value = value.trim();
    if value.len() != 64 || !value.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err("folderSyncKey".into());
    }
    (0..64)
        .step_by(2)
        .map(|offset| {
            u8::from_str_radix(&value[offset..offset + 2], 16)
                .map_err(|_| "folderSyncKey".to_string())
        })
        .collect::<Result<Vec<_>, _>>()
        .map(Zeroizing::new)
}

pub(super) fn seal(bytes: &[u8], key: &[u8]) -> Result<Vec<u8>, String> {
    if bytes.len() > MAX_BYTES {
        return Err("folderSyncFormat".into());
    }
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|_| "folderSyncKey")?;
    let nonce: [u8; 12] = rand::random();
    let encrypted = cipher
        .encrypt(
            Nonce::from_slice(&nonce),
            Payload {
                msg: bytes,
                aad: MAGIC,
            },
        )
        .map_err(|_| "folderSyncFormat")?;
    Ok([MAGIC, &nonce, &encrypted].concat())
}

pub(super) fn open(bytes: &[u8], key: &[u8]) -> Result<Zeroizing<Vec<u8>>, String> {
    let offset = MAGIC.len();
    if bytes.len() < offset + 12 + 16
        || bytes.len() > MAX_BYTES + offset + 28
        || !bytes.starts_with(MAGIC)
    {
        return Err("folderSyncFormat".into());
    }
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|_| "folderSyncKey")?;
    cipher
        .decrypt(
            Nonce::from_slice(&bytes[offset..offset + 12]),
            Payload {
                msg: &bytes[offset + 12..],
                aad: MAGIC,
            },
        )
        .map(Zeroizing::new)
        .map_err(|_| "folderSyncKey".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn round_trip_randomizes_ciphertext_and_rejects_wrong_key_and_tampering() {
        let key = [7; 32];
        let a = seal(b"account credential", &key).unwrap();
        let b = seal(b"account credential", &key).unwrap();
        assert_ne!(a, b);
        assert_eq!(&**open(&a, &key).unwrap(), b"account credential");
        assert!(open(&a, &[8; 32]).is_err());
        let mut corrupt = a;
        *corrupt.last_mut().unwrap() ^= 1;
        assert!(open(&corrupt, &key).is_err());
    }
    #[test]
    fn key_format_and_bounded_envelopes_are_validated() {
        assert_eq!(parse_key(&"ab".repeat(32)).unwrap().len(), 32);
        for value in ["short".to_string(), "zz".repeat(32), "密".repeat(64)] {
            assert!(parse_key(&value).is_err());
        }
        assert!(open(b"old embedded-key archive", &[0; 32]).is_err());
        assert!(seal(&vec![0; MAX_BYTES + 1], &[0; 32]).is_err());
    }
}
