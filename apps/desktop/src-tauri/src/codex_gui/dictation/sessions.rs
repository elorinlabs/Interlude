use std::{
    collections::HashMap,
    time::{Duration, Instant},
};
use tokio::sync::{watch, Mutex};

use super::{
    account::Account,
    error::{Error, Result},
};

const SESSION_LIFETIME: Duration = Duration::from_secs(10 * 60);
const MAX_SESSIONS: usize = 8;

struct Session {
    account: Account,
    created: Instant,
    busy: bool,
    cancel: watch::Sender<bool>,
}

/// Pins recordings to the selected account and bounds abandoned sessions.
#[derive(Default)]
pub(crate) struct Sessions(Mutex<HashMap<String, Session>>);

impl Sessions {
    pub(super) async fn create(&self, account: Account) -> Result<String> {
        let mut sessions = self.0.lock().await;
        sessions.retain(|_, session| session.created.elapsed() < SESSION_LIFETIME);
        if sessions.len() >= MAX_SESSIONS {
            return Err(Error::Busy);
        }
        let id = uuid::Uuid::new_v4().to_string();
        let (cancel, _) = watch::channel(false);
        sessions.insert(
            id.clone(),
            Session {
                account,
                created: Instant::now(),
                busy: false,
                cancel,
            },
        );
        Ok(id)
    }

    pub(super) async fn begin(&self, id: &str) -> Result<(Account, watch::Receiver<bool>)> {
        let mut sessions = self.0.lock().await;
        let session = sessions.get_mut(id).ok_or(Error::Expired)?;
        if session.created.elapsed() >= SESSION_LIFETIME {
            sessions.remove(id);
            return Err(Error::Expired);
        }
        if session.busy {
            return Err(Error::Busy);
        }
        session.busy = true;
        Ok((session.account.clone(), session.cancel.subscribe()))
    }

    pub(super) async fn finish(&self, id: &str, success: bool) {
        let mut sessions = self.0.lock().await;
        if success {
            sessions.remove(id);
        } else if let Some(session) = sessions.get_mut(id) {
            session.busy = false;
        }
    }

    pub(super) async fn cancel(&self, id: &str) {
        // Dropping the sender wakes the request's cancellation receiver.
        self.0.lock().await.remove(id);
    }
}
