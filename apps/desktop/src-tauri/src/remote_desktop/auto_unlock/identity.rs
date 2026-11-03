//! Account names are resolved to the service owner's SID before storing or submitting credentials.
use super::Error;
use std::{mem::size_of, ptr};
use windows_sys::Win32::{
    Foundation::{CloseHandle, LocalFree},
    Security::{
        Authorization::ConvertSidToStringSidW, GetTokenInformation, LookupAccountNameW,
        SidTypeUser, TokenUser, TOKEN_USER,
    },
    System::{RemoteDesktop::*, StationsAndDesktops::*, Threading::GetCurrentProcessId},
};

pub(super) struct Account {
    pub sid: String,
    pub username: String,
}

pub(super) fn resolve_account(username: &str) -> Result<Account, Error> {
    let name: Vec<u16> = username.encode_utf16().chain(Some(0)).collect();
    let mut sid = [0u32; 68];
    let mut domain = [0u16; 256];
    let mut sid_length = std::mem::size_of_val(&sid) as u32;
    let mut domain_length = domain.len() as u32;
    let mut kind = 0;
    // SAFETY: all buffers are aligned and sized explicitly; the NUL-terminated name lives through the lookup.
    if unsafe {
        LookupAccountNameW(
            ptr::null(),
            name.as_ptr(),
            sid.as_mut_ptr().cast(),
            &mut sid_length,
            domain.as_mut_ptr(),
            &mut domain_length,
            &mut kind,
        )
    } == 0
        || kind != SidTypeUser
    {
        return Err(Error::Account);
    }
    Ok(Account {
        sid: sid_text(sid.as_mut_ptr().cast())?,
        username: login_name(username, &text(&domain)?)?,
    })
}

fn login_name(username: &str, domain: &str) -> Result<String, Error> {
    // Resolve bare names on the controlled computer, including its domain accounts.
    // Explicit provider names and UPNs must retain their authentication semantics.
    let name = if username.contains(['\\', '@']) {
        username.to_owned()
    } else if domain.is_empty() {
        return Err(Error::Account);
    } else {
        format!("{domain}\\{username}")
    };
    if !super::valid_text(&name) {
        return Err(Error::Invalid);
    }
    Ok(name)
}
fn sid_text(sid: *mut std::ffi::c_void) -> Result<String, Error> {
    let mut text = ptr::null_mut();
    // SAFETY: successful LookupAccountNameW returned a valid SID. Windows allocates the conversion output.
    unsafe {
        if ConvertSidToStringSidW(sid, &mut text) == 0 {
            return Err(Error::Account);
        }
        let mut length = 0;
        while length < 184 && *text.add(length) != 0 {
            length += 1;
        }
        let value = String::from_utf16(std::slice::from_raw_parts(text, length))
            .map_err(|_| Error::Account);
        LocalFree(text.cast());
        value
    }
}

pub(super) fn session_owner(session: u32) -> Result<String, Error> {
    let mut token = ptr::null_mut();
    let mut bytes = [0usize; 64];
    let mut length = 0;
    // SAFETY: SYSTEM obtains a new token handle, queries into an aligned buffer, and closes it exactly once.
    unsafe {
        if WTSQueryUserToken(session, &mut token) == 0 {
            return Err(Error::Account);
        }
        let valid = GetTokenInformation(
            token,
            TokenUser,
            bytes.as_mut_ptr().cast(),
            std::mem::size_of_val(&bytes) as u32,
            &mut length,
        ) != 0;
        if CloseHandle(token) == 0 {
            eprintln!("automatic unlock token cleanup failed");
        }
        if !valid {
            return Err(Error::Account);
        }
        sid_text((*bytes.as_ptr().cast::<TOKEN_USER>()).User.Sid)
    }
}

pub(super) struct Console {
    pub session: u32,
    pub locked: bool,
    pub username: Option<String>,
}
pub(super) fn console() -> Result<Console, Error> {
    let mut session = 0;
    // SAFETY: output points to a live DWORD; the other API has no pointer inputs.
    if unsafe { ProcessIdToSessionId(GetCurrentProcessId(), &mut session) } == 0
        || session != unsafe { WTSGetActiveConsoleSessionId() }
    {
        return Err(Error::Unavailable);
    }
    let mut buffer = ptr::null_mut();
    let mut size = 0;
    // SAFETY: Windows allocates this bounded WTSINFOEXW buffer and it is freed after copying its fields.
    unsafe {
        if WTSQuerySessionInformationW(
            ptr::null_mut(),
            session,
            WTSSessionInfoEx,
            &mut buffer,
            &mut size,
        ) == 0
        {
            return Err(Error::Unavailable);
        }
        let result = if size as usize >= size_of::<WTSINFOEXW>() {
            let info = &*buffer.cast::<WTSINFOEXW>();
            if info.Level == 1 {
                parse(session, &info.Data.WTSInfoExLevel1)
            } else {
                Err(Error::Unavailable)
            }
        } else {
            Err(Error::Unavailable)
        };
        WTSFreeMemory(buffer.cast());
        result
    }
}
fn parse(session: u32, info: &WTSINFOEX_LEVEL1_W) -> Result<Console, Error> {
    let username = text(&info.UserName)?;
    let domain = text(&info.DomainName)?;
    let username = (!username.is_empty()).then(|| {
        if domain.is_empty() {
            username
        } else {
            format!("{domain}\\{username}")
        }
    });
    let locked = match info.SessionFlags as u32 {
        WTS_SESSIONSTATE_LOCK => true,
        WTS_SESSIONSTATE_UNLOCK => false,
        _ if username.is_none() => true,
        _ => return Err(Error::Unavailable),
    };
    // A logon screen before the first sign-in may not have a user/lock flag yet.
    Ok(Console {
        session,
        locked: locked || username.is_none(),
        username,
    })
}
pub(super) fn show_sign_in() {
    // SAFETY: only the authenticated SYSTEM worker calls this after verifying the locked console/Winlogon desktop.
    // Windows enforces the machine's Secure Attention Sequence policy; no policy or system provider is changed.
    unsafe {
        windows_sys::Win32::Security::Authentication::Identity::SendSAS(0);
    }
}
fn text(value: &[u16]) -> Result<String, Error> {
    let end = value
        .iter()
        .position(|unit| *unit == 0)
        .unwrap_or(value.len());
    String::from_utf16(&value[..end]).map_err(|_| Error::Unavailable)
}
pub(super) fn login_desktop() -> bool {
    // SAFETY: the owned input desktop is closed after querying its name; no thread desktop is changed.
    unsafe {
        let desktop = OpenInputDesktop(0, 0, DESKTOP_READOBJECTS);
        if desktop.is_null() {
            return false;
        }
        let mut name = [0u16; 64];
        let mut size = 0;
        let success = GetUserObjectInformationW(
            desktop,
            UOI_NAME,
            name.as_mut_ptr().cast(),
            std::mem::size_of_val(&name) as u32,
            &mut size,
        ) != 0;
        if CloseDesktop(desktop) == 0 {
            eprintln!("automatic unlock desktop cleanup failed");
        }
        success && text(&name).is_ok_and(|name| name.eq_ignore_ascii_case("Winlogon"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bare_usernames_use_the_domain_resolved_by_the_controlled_computer() {
        assert_eq!(
            login_name("alice", "REMOTE-PC").unwrap(),
            "REMOTE-PC\\alice"
        );
        assert_eq!(login_name("alice", "CORP").unwrap(), "CORP\\alice");
        assert!(matches!(login_name("alice", ""), Err(Error::Account)));
        assert!(matches!(
            login_name(&"a".repeat(256), "PC"),
            Err(Error::Invalid)
        ));
    }

    #[test]
    fn qualified_and_online_account_names_are_preserved() {
        for username in [
            "PC\\alice",
            ".\\alice",
            "CORP\\alice",
            "MicrosoftAccount\\alice@example.test",
            "AzureAD\\alice@example.test",
            "alice@example.test",
        ] {
            assert_eq!(login_name(username, "REMOTE-PC").unwrap(), username);
        }
    }
}
