use super::{
    platform,
    preferences::{Preferences, Store},
    Change, Snapshot,
};
use crate::remote_desktop::{auto_unlock, permissions::Permissions, DesktopError, Result};
use std::{
    path::Path,
    sync::{Arc, Mutex},
};

#[derive(Default)]
struct State {
    preferences: Preferences,
    store: Option<Store>,
    muted: Option<platform::MutedEndpoint>,
    connected: bool,
}

/// Displays in one viewer share cleanup ownership, while each new viewer loads host preferences.
#[derive(Clone, Default)]
pub(in crate::remote_desktop) struct Guard(Arc<Mutex<State>>);

impl Guard {
    pub(in crate::remote_desktop) fn load(root: &Path) -> Result<Self> {
        let store = Store::new(root);
        let preferences = store.load()?;
        Ok(Self(Arc::new(Mutex::new(State {
            preferences,
            store: Some(store),
            muted: None,
            connected: false,
        }))))
    }

    pub(in crate::remote_desktop) fn snapshot(&self) -> Result<Snapshot> {
        let preferences = self
            .0
            .lock()
            .map_err(|_| DesktopError::Platform)?
            .preferences;
        Ok(Snapshot {
            lock_on_disconnect: preferences.lock_on_disconnect,
            mute_host: preferences.mute_host,
            clipboard_sync: Some(preferences.clipboard_sync),
            privacy_screen: Some(preferences.privacy_screen),
            auto_unlock: auto_unlock::snapshot(),
        })
    }

    pub(in crate::remote_desktop) fn connect(&self, permissions: Permissions) -> Result<()> {
        let mut state = self.0.lock().map_err(|_| DesktopError::Platform)?;
        if state.connected || !permissions.control {
            return Ok(());
        }
        if state.preferences.mute_host && permissions.audio {
            state.mute(true)?;
        }
        state.connected = true;
        let privacy = state.preferences.privacy_screen;
        drop(state);
        // A saved password and an immediate sign-in attempt have independent outcomes.
        // Saved privacy must hide the physical desktop before automatic sign-in can expose it.
        if !privacy {
            auto_unlock::connect_saved();
        }
        Ok(())
    }

    pub(super) fn apply(&self, change: Change) -> Result<Snapshot> {
        let mut state = self.0.lock().map_err(|_| DesktopError::Platform)?;
        let mut next = state.preferences;
        if let Some(value) = change.lock_on_disconnect {
            next.lock_on_disconnect = value;
        }
        if let Some(value) = change.mute_host {
            next.mute_host = value;
        }
        if let Some(value) = change.clipboard_sync {
            next.clipboard_sync = value;
        }
        if next != state.preferences {
            let was_muted = state.muted.is_some();
            if change.mute_host.is_some() {
                state.mute(next.mute_host)?;
            }
            if let Err(error) = state.save(next) {
                if let Err(restore) = state.mute(was_muted) {
                    eprintln!("desktop security audio rollback: {restore}");
                }
                return Err(error);
            }
        }
        drop(state);
        if let Some(unlock) = change.auto_unlock {
            auto_unlock::apply(unlock)?;
        }
        self.snapshot()
    }

    pub(in crate::remote_desktop) fn remember_privacy(&self, enabled: bool) -> Result<()> {
        let mut state = self.0.lock().map_err(|_| DesktopError::Platform)?;
        let next = Preferences {
            privacy_screen: enabled,
            ..state.preferences
        };
        state.save(next)
    }
}

impl State {
    fn save(&mut self, next: Preferences) -> Result<()> {
        self.store
            .as_ref()
            .ok_or(DesktopError::Settings)?
            .save(&next)?;
        self.preferences = next;
        Ok(())
    }

    fn mute(&mut self, enabled: bool) -> Result<()> {
        if enabled && self.muted.is_none() {
            self.muted = Some(platform::MutedEndpoint::acquire()?);
        } else if !enabled {
            if let Some(endpoint) = self.muted.as_ref() {
                endpoint.restore()?;
            }
            self.muted = None;
        }
        Ok(())
    }
}

impl Drop for State {
    fn drop(&mut self) {
        if let Some(endpoint) = self.muted.take() {
            if let Err(error) = endpoint.restore() {
                eprintln!("desktop security audio cleanup: {error}");
            }
        }
        if !self.connected {
            return;
        }
        auto_unlock::cancel();
        if self.preferences.lock_on_disconnect {
            if let Err(error) = platform::lock() {
                eprintln!("desktop security lock cleanup: {error}");
            }
        }
    }
}
