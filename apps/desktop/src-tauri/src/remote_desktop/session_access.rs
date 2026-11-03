//! Detect a locked Windows session before capture or input can fail with an unrelated error.
use super::{DesktopError, Result};
use std::{mem::size_of, ptr};
use windows_sys::Win32::System::{RemoteDesktop::*, Threading::*};

pub(super) fn check() -> Result<()> {
    let worker = super::input_desktop::is_worker();
    require_access(worker, if worker { None } else { locked() })
}

fn require_access(worker: bool, locked: Option<bool>) -> Result<()> {
    if !worker && locked == Some(true) {
        Err(DesktopError::LockedWithoutUnattended)
    } else {
        Ok(())
    }
}

fn locked() -> Option<bool> {
    let mut session = 0;
    let mut buffer = ptr::null_mut();
    let mut size = 0;
    // SAFETY: Windows initializes the session and allocated WTS buffer. We validate its size/level,
    // copy only the lock flag, and free it without retaining pointers or changing the desktop.
    unsafe {
        if ProcessIdToSessionId(GetCurrentProcessId(), &mut session) == 0
            || WTSQuerySessionInformationW(
                ptr::null_mut(),
                session,
                WTSSessionInfoEx,
                &mut buffer,
                &mut size,
            ) == 0
        {
            return None;
        }
        let result = if !buffer.is_null() && size as usize >= size_of::<WTSINFOEXW>() {
            let info = &*buffer.cast::<WTSINFOEXW>();
            (info.Level == 1)
                .then(|| {
                    let state = &info.Data.WTSInfoExLevel1;
                    lock_state(state.SessionFlags, state.UserName[0] != 0)
                })
                .flatten()
        } else {
            None
        };
        WTSFreeMemory(buffer.cast());
        result
    }
}

fn lock_state(flags: i32, has_user: bool) -> Option<bool> {
    match flags as u32 {
        WTS_SESSIONSTATE_LOCK => Some(true),
        WTS_SESSIONSTATE_UNLOCK => Some(!has_user),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn locked_sessions_need_unattended_access_but_unlocked_sessions_do_not() {
        assert!(matches!(
            require_access(false, Some(true)),
            Err(DesktopError::LockedWithoutUnattended)
        ));
        assert!(require_access(false, Some(false)).is_ok());
        assert!(require_access(false, None).is_ok());
        assert!(require_access(true, Some(true)).is_ok());
    }

    #[test]
    fn unknown_session_state_is_not_reported_as_a_lock() {
        assert_eq!(lock_state(WTS_SESSIONSTATE_LOCK as i32, true), Some(true));
        assert_eq!(
            lock_state(WTS_SESSIONSTATE_UNLOCK as i32, true),
            Some(false)
        );
        assert_eq!(
            lock_state(WTS_SESSIONSTATE_UNLOCK as i32, false),
            Some(true)
        );
        assert_eq!(lock_state(-1, true), None);
    }
}
