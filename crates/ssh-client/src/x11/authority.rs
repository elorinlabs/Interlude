use super::display::Display;
use crate::{Error, Result};
use std::{io::Read, path::PathBuf};
use zeroize::Zeroizing;

pub(super) const AUTH_PROTOCOL: &[u8] = b"MIT-MAGIC-COOKIE-1";
const MAX_AUTHORITY_BYTES: u64 = 1024 * 1024;

pub(super) async fn load(display: &Display) -> Result<Zeroizing<Vec<u8>>> {
    let number = display.number.to_string();
    tokio::task::spawn_blocking(move || {
        let Some(path) = authority_path() else {
            return Ok(Zeroizing::new(Vec::new()));
        };
        let file = match std::fs::File::open(path) {
            Ok(file) => file,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                return Ok(Zeroizing::new(Vec::new()))
            }
            Err(_) => return Err(Error::X11Unavailable),
        };
        let mut bytes = Zeroizing::new(Vec::new());
        file.take(MAX_AUTHORITY_BYTES + 1)
            .read_to_end(&mut bytes)
            .map_err(|_| Error::X11Unavailable)?;
        if bytes.len() as u64 > MAX_AUTHORITY_BYTES {
            return Err(Error::X11Unavailable);
        }
        parse(&bytes, number.as_bytes())
    })
    .await
    .map_err(|_| Error::X11Unavailable)?
}

fn authority_path() -> Option<PathBuf> {
    if let Some(path) = std::env::var_os("XAUTHORITY").filter(|value| !value.is_empty()) {
        return Some(path.into());
    }
    std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(|home| PathBuf::from(home).join(".Xauthority"))
}

pub(super) fn parse(mut bytes: &[u8], display: &[u8]) -> Result<Zeroizing<Vec<u8>>> {
    while !bytes.is_empty() {
        let family = read_number(&mut bytes)?;
        let address = read_field(&mut bytes)?;
        let number = read_field(&mut bytes)?;
        let protocol = read_field(&mut bytes)?;
        let cookie = read_field(&mut bytes)?;
        let local = match family {
            256 | 65535 => true, // FamilyLocal / FamilyWild
            0 => address == [127, 0, 0, 1],
            6 => address == std::net::Ipv6Addr::LOCALHOST.octets(),
            _ => false,
        };
        if local && number == display && protocol == AUTH_PROTOCOL && cookie.len() == 16 {
            return Ok(Zeroizing::new(cookie.to_vec()));
        }
    }
    // An X server may use local host access control instead of an authority file.
    Ok(Zeroizing::new(Vec::new()))
}

fn read_number(bytes: &mut &[u8]) -> Result<u16> {
    let value = bytes.get(..2).ok_or(Error::X11Unavailable)?;
    let result = u16::from_be_bytes([value[0], value[1]]);
    *bytes = &bytes[2..];
    Ok(result)
}

fn read_field<'a>(bytes: &mut &'a [u8]) -> Result<&'a [u8]> {
    let length = usize::from(read_number(bytes)?);
    let result = bytes.get(..length).ok_or(Error::X11Unavailable)?;
    *bytes = &bytes[length..];
    Ok(result)
}
