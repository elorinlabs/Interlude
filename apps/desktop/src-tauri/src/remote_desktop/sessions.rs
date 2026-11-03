//! Each visited display has its own expiring lease; a host-issued group retains single-viewer ownership.
use super::{DesktopError, Result, Session};
use std::{
    collections::HashMap,
    sync::{Mutex, OnceLock},
    time::{Duration, Instant},
};

const LEASE: Duration = Duration::from_secs(15);
pub(super) struct Options {
    pub expires_at: Option<u64>,
    pub capture_group: Option<String>,
    #[cfg_attr(
        not(windows),
        expect(
            dead_code,
            reason = "Security settings are currently supported on Windows hosts."
        )
    )]
    pub settings_root: std::path::PathBuf,
}
pub(super) static SESSIONS: OnceLock<Mutex<HashMap<String, Session>>> = OnceLock::new();

// Heartbeats must remain independent of input desktop availability during lock transitions.
pub(super) fn with_lease<T>(
    id: &str,
    operation: impl FnOnce(&mut Session) -> Result<T>,
) -> Result<T> {
    let mut guard = SESSIONS
        .get_or_init(Default::default)
        .lock()
        .map_err(|_| DesktopError::Platform)?;
    let session = guard.get_mut(id).ok_or(DesktopError::Expired)?;
    if !live(session) {
        return Err(DesktopError::Expired);
    }
    session.touched = Instant::now();
    operation(session)
}

fn live(session: &Session) -> bool {
    session.touched.elapsed() <= LEASE && Instant::now() < session.deadline
}

#[cfg(any(windows, target_os = "macos"))]
fn may_join(sessions: &HashMap<String, Session>, group: Option<&str>, display: &str) -> bool {
    sessions
        .values()
        .filter(|session| live(session))
        .all(|session| {
            group.is_some()
                && session.capture_group.as_deref() == group
                && session.display.info.id != display
                && session.privacy.is_none()
        })
}

#[cfg(any(windows, target_os = "macos"))]
pub(super) fn begin_session(
    display: super::monitors::Monitor,
    permissions: super::permissions::Permissions,
    options: Options,
) -> Result<String> {
    let deadline = super::lease::deadline(options.expires_at)?;
    let capture_group = options.capture_group;
    let mut guard = SESSIONS
        .get_or_init(Default::default)
        .lock()
        .map_err(|_| DesktopError::Platform)?;
    if !may_join(&guard, capture_group.as_deref(), &display.info.id) {
        return Err(DesktopError::Busy);
    }
    let expired: Vec<_> = guard
        .values()
        .filter(|session| !live(session))
        .map(|session| session.id.clone())
        .collect();
    for id in expired {
        release(guard.remove(&id))?;
    }
    let id = uuid::Uuid::new_v4().to_string();
    #[cfg(windows)]
    let security = guard
        .values()
        .find(|session| capture_group.is_some() && session.capture_group == capture_group)
        .map(|session| Ok(session.security.clone()))
        .unwrap_or_else(|| super::security::Guard::load(&options.settings_root))?;
    guard.insert(
        id.clone(),
        Session {
            #[cfg(windows)]
            security,
            privacy: None,
            permissions,
            id: id.clone(),
            capture_group,
            touched: Instant::now(),
            deadline,
            clipboard: None,
            clipboard_revision: super::clipboard_revision::current().ok(),
            display,
            input: super::platform_input::InputState::default(),
        },
    );
    let watched = id.clone();
    std::thread::spawn(move || expire(watched));
    Ok(id)
}

#[cfg(any(windows, target_os = "macos"))]
fn expire(id: String) {
    loop {
        std::thread::sleep(Duration::from_secs(1));
        let Ok(mut guard) = SESSIONS.get_or_init(Default::default).lock() else {
            return;
        };
        let Some(session) = guard.get(&id) else {
            return;
        };
        if live(session) {
            continue;
        }
        if let Err(error) = release(guard.remove(&id)) {
            eprintln!("desktop input cleanup: {error}");
        }
        return;
    }
}

fn release(_session: Option<Session>) -> Result<()> {
    #[cfg(any(windows, target_os = "macos"))]
    if let Some(mut session) = _session {
        #[cfg(windows)]
        super::clipboard_stream::release(&format!("host:{}", session.id));
        #[cfg(windows)]
        let _desktop = super::input_desktop::InputDesktop::enter()?;
        session.input.release()?;
    }
    Ok(())
}

pub(super) fn close(id: &str) -> Result<()> {
    // Finish group cleanup before another viewer can open and inherit an about-to-be-locked desktop.
    let mut guard = SESSIONS
        .get_or_init(Default::default)
        .lock()
        .map_err(|_| DesktopError::Platform)?;
    release(guard.remove(id))
}

pub(super) fn revoke() -> Result<()> {
    let mut guard = SESSIONS
        .get_or_init(Default::default)
        .lock()
        .map_err(|_| DesktopError::Platform)?;
    let sessions = std::mem::take(&mut *guard);
    let mut result = Ok(());
    for session in sessions.into_values() {
        if let Err(error) = release(Some(session)) {
            result = Err(error);
        }
    }
    result
}

#[cfg(all(test, any(windows, target_os = "macos")))]
#[path = "sessions_tests.rs"]
mod tests;
