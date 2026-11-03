use aes_gcm::{
    aead::{Aead, Payload},
    Aes256Gcm, KeyInit, Nonce,
};
use argon2::{Algorithm, Argon2, Params, Version};
use zeroize::Zeroizing;

const MAGIC: &[u8] = b"INTERLUDE-PORTABLE-1";
const SALT_LEN: usize = 16;
const NONCE_LEN: usize = 12;
pub(super) const MAX_BYTES: usize = 20 * 1024 * 1024;

fn derive(password: &str, salt: &[u8]) -> Result<Zeroizing<[u8; 32]>, String> {
    if password.chars().count() < 12 || password.len() > 1024 {
        return Err("backupPassword".into());
    }
    let params = Params::new(65_536, 3, 1, Some(32)).map_err(|_| "backupFormat")?;
    let mut key = Zeroizing::new([0; 32]);
    Argon2::new(Algorithm::Argon2id, Version::V0x13, params)
        .hash_password_into(password.as_bytes(), salt, key.as_mut())
        .map_err(|_| "backupFormat")?;
    Ok(key)
}

pub(super) fn seal(bytes: &[u8], password: &str) -> Result<Vec<u8>, String> {
    if bytes.len() > MAX_BYTES {
        return Err("backupFormat".into());
    }
    let salt: [u8; SALT_LEN] = rand::random();
    let nonce: [u8; NONCE_LEN] = rand::random();
    let key = derive(password, &salt)?;
    let cipher = Aes256Gcm::new_from_slice(&*key).map_err(|_| "backupFormat")?;
    let encrypted = cipher
        .encrypt(
            Nonce::from_slice(&nonce),
            Payload {
                msg: bytes,
                aad: MAGIC,
            },
        )
        .map_err(|_| "backupFormat")?;
    Ok([MAGIC, &salt, &nonce, &encrypted].concat())
}

pub(super) fn open(bytes: &[u8], password: &str) -> Result<Zeroizing<Vec<u8>>, String> {
    let header = MAGIC.len() + SALT_LEN + NONCE_LEN;
    if bytes.len() < header + 16
        || bytes.len() > MAX_BYTES + header + 16
        || !bytes.starts_with(MAGIC)
    {
        return Err("backupFormat".into());
    }
    let key = derive(password, &bytes[MAGIC.len()..MAGIC.len() + SALT_LEN])?;
    let cipher = Aes256Gcm::new_from_slice(&*key).map_err(|_| "backupFormat")?;
    cipher
        .decrypt(
            Nonce::from_slice(&bytes[MAGIC.len() + SALT_LEN..header]),
            Payload {
                msg: &bytes[header..],
                aad: MAGIC,
            },
        )
        .map(Zeroizing::new)
        .map_err(|_| "backupDecrypt".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn complete_credentials_roundtrip_without_plaintext_or_machine_keys() {
        let payload=br#"{"password":"synthetic-login-password","totp":"JBSWY3DPEHPK3PXP","email":"fixture@example.invalid"}"#;
        let a = seal(payload, "portable test passphrase").unwrap();
        let b = seal(payload, "portable test passphrase").unwrap();
        assert_ne!(a, b);
        assert!(!String::from_utf8_lossy(&a).contains("synthetic-login-password"));
        assert!(!String::from_utf8_lossy(&a).contains("JBSWY3DPEHPK3PXP"));
        assert_eq!(&**open(&a, "portable test passphrase").unwrap(), payload);
        assert_eq!(
            open(&a, "incorrect passphrase").unwrap_err(),
            "backupDecrypt"
        );
        let mut changed = a;
        *changed.last_mut().unwrap() ^= 1;
        assert!(open(&changed, "portable test passphrase").is_err());
    }
    #[test]
    fn invalid_envelopes_and_short_passwords_are_rejected_before_decryption() {
        assert_eq!(seal(b"data", "short").unwrap_err(), "backupPassword");
        assert_eq!(
            open(b"truncated", "valid passphrase").unwrap_err(),
            "backupFormat"
        );
        assert_eq!(
            seal(&vec![0; MAX_BYTES + 1], "valid passphrase").unwrap_err(),
            "backupFormat"
        );
    }
}
