use super::{
    identity,
    storage::{self, Attempt, Credentials},
    Change, Error, Snapshot, Status,
};
use crate::desktop_service::{configuration, login_provider};
use sha2::{Digest, Sha256};
use std::time::{SystemTime, UNIX_EPOCH};

fn supported() -> bool {
    super::super::input_desktop::is_worker() && login_provider::available()
}
fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

fn credentials() -> Result<Option<Credentials>, Error> {
    let config = configuration::read().map_err(|_| Error::Unavailable)?;
    let value = storage::load()?;
    if value.as_ref().is_some_and(|value| {
        value.owner_sid != config.owner_sid
            || value.device_id != config.device_id
            || value.service_binding
                != format!("{:x}", Sha256::digest(config.credential.as_bytes()))
    }) {
        storage::clear()?;
        return Ok(None);
    }
    Ok(value)
}
pub(in crate::remote_desktop) fn snapshot() -> Option<Snapshot> {
    if !supported() {
        return None;
    }
    Some(snapshot_inner().unwrap_or(Snapshot {
        enabled: false,
        status: Status::Unavailable,
    }))
}
fn snapshot_inner() -> Result<Snapshot, Error> {
    let Some(mut value) = credentials()? else {
        return Ok(Snapshot {
            enabled: false,
            status: Status::Disabled,
        });
    };
    if reconcile(&mut value).is_err() {
        return Ok(Snapshot {
            enabled: true,
            status: Status::Unavailable,
        });
    }
    let status = if value.pending.is_some() {
        Status::Unlocking
    } else if value.blocked {
        Status::Failed
    } else {
        Status::Ready
    };
    Ok(Snapshot {
        enabled: true,
        status,
    })
}
pub(in crate::remote_desktop) fn apply(mut change: Change) -> Result<(), Error> {
    change.validate()?;
    if !supported() {
        return Err(Error::Unavailable);
    }
    if !change.enabled {
        return storage::clear();
    }
    let config = configuration::read().map_err(|_| Error::Unavailable)?;
    let account = identity::resolve_account(change.username.as_deref().ok_or(Error::Invalid)?)?;
    if account.sid != config.owner_sid {
        return Err(Error::Account);
    }
    let value = Credentials {
        owner_sid: config.owner_sid,
        device_id: config.device_id,
        service_binding: format!("{:x}", Sha256::digest(config.credential.as_bytes())),
        username: account.username,
        password: change.password.take().ok_or(Error::Invalid)?,
        blocked: false,
        pending: None,
    };
    storage::cancel()?;
    storage::save(&value)?;
    // Saving must not be reported as failed merely because the current console cannot sign in yet.
    connect_saved();
    Ok(())
}
pub(in crate::remote_desktop) fn connect_saved() {
    if let Err(error) = connect() {
        eprintln!("automatic unlock could not start: {error}");
    }
}
fn connect() -> Result<(), Error> {
    if !supported() {
        return Ok(());
    }
    let Some(mut value) = credentials()? else {
        return Ok(());
    };
    reconcile(&mut value)?;
    if value.blocked || value.pending.is_some() {
        return Ok(());
    }
    let console = identity::console()?;
    if !console.locked {
        return Ok(());
    }
    if !identity::login_desktop() {
        return Err(Error::Unavailable);
    }
    if console.username.is_some() && identity::session_owner(console.session)? != value.owner_sid {
        value.blocked = true;
        storage::save(&value)?;
        return Err(Error::Account);
    }
    let attempt = Attempt {
        nonce: *uuid::Uuid::new_v4().as_bytes(),
        expires: now() + 10,
        session: console.session,
    };
    let mut bytes = storage::request_bytes(&value, &attempt);
    storage::cancel()?;
    value.pending = Some(attempt);
    value.blocked = true;
    storage::save(&value)?;
    storage::seal(storage::REQUEST, &mut bytes)?;
    identity::show_sign_in();
    Ok(())
}

fn reconcile(value: &mut Credentials) -> Result<(), Error> {
    let Some(attempt) = &value.pending else {
        return Ok(());
    };
    let result = storage::read_bytes(storage::RESULT)?;
    let reported = result
        .as_deref()
        .and_then(|bytes| result_status(bytes, &attempt.nonce));
    let unlocked = identity::console().is_ok_and(|console| {
        console.session == attempt.session
            && !console.locked
            && identity::session_owner(console.session).ok().as_ref() == Some(&value.owner_sid)
    });
    let Some(success) = outcome(reported, unlocked, now() >= attempt.expires) else {
        return Ok(());
    };
    value.blocked = !success;
    value.pending = None;
    storage::cancel()?;
    storage::save(value)
}
pub(in crate::remote_desktop) fn cancel() {
    if !super::super::input_desktop::is_worker() {
        return;
    }
    if let Ok(Some(mut value)) = credentials() {
        if reconcile(&mut value).is_err() {
            eprintln!("automatic unlock outcome cleanup failed");
        }
    }
    // The persisted blocked marker survives cancellation/crashes, so a reconnect cannot repeat a failed attempt.
    if storage::cancel().is_err() {
        eprintln!("automatic unlock request cleanup failed");
    }
}
fn result_status(bytes: &[u8], nonce: &[u8; 16]) -> Option<i32> {
    if bytes.len() != 20 || &bytes[..16] != nonce {
        return None;
    }
    Some(i32::from_le_bytes(bytes[16..20].try_into().ok()?))
}

fn outcome(reported: Option<i32>, unlocked: bool, expired: bool) -> Option<bool> {
    // Password rejection takes precedence over a concurrent manual sign-in. Never automatically retry that password.
    if reported.is_some_and(|status| status != 0) {
        return Some(false);
    }
    if unlocked {
        return Some(true);
    }
    // A success report alone is insufficient: wait for the expected account's session to unlock.
    expired.then_some(false)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn failed_or_expired_attempts_stay_blocked_and_success_requires_an_unlocked_session() {
        assert_eq!(outcome(None, false, false), None);
        assert_eq!(outcome(Some(0), false, false), None);
        assert_eq!(outcome(None, false, true), Some(false));
        assert_eq!(outcome(Some(0), false, true), Some(false));
        assert_eq!(outcome(Some(-1), false, false), Some(false));
        assert_eq!(outcome(Some(-1), true, false), Some(false));
        assert_eq!(outcome(Some(0), true, false), Some(true));
        assert_eq!(outcome(None, true, false), Some(true));
    }
    #[test]
    fn results_must_match_the_one_time_attempt() {
        let nonce = [7; 16];
        let mut bytes = nonce.to_vec();
        bytes.extend_from_slice(&0i32.to_le_bytes());
        assert_eq!(result_status(&bytes, &nonce), Some(0));
        assert_eq!(result_status(&bytes, &[8; 16]), None);
        assert_eq!(result_status(&bytes[..19], &nonce), None);
        bytes.push(0);
        assert_eq!(result_status(&bytes, &nonce), None);
    }
}
