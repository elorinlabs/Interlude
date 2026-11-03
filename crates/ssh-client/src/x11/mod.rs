//! Authenticated X11 channels. The local cookie never leaves the SSH host PC.
mod authority;
mod display;
mod protocol;
mod server;
pub use server::ensure_x11;

use crate::{connection::TIMEOUT, sessions::Sink, Error, Event, Result, X11};
use russh::{client, Channel, ChannelMsg};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use tokio::{
    io::AsyncWriteExt,
    sync::{watch, Semaphore},
    task::JoinSet,
};
use zeroize::Zeroizing;

const MAX_CHANNELS: usize = 32;

pub(crate) fn validate_display(value: &str) -> Result<()> {
    display::Display::parse(value).map(|_| ())
}

pub(crate) struct State {
    display: display::Display,
    cookie: Zeroizing<Vec<u8>>,
    fake: Zeroizing<[u8; 16]>,
    enabled: AtomicBool,
    closed: watch::Sender<bool>,
    sink: Sink,
}

/// The shell owns this lease; errors during opening also cancel accepted channels.
pub(crate) struct Lease(pub Arc<State>);
impl Drop for Lease {
    fn drop(&mut self) {
        self.0.stop();
    }
}

impl State {
    pub async fn prepare(options: &X11, sink: Sink) -> Result<Lease> {
        let server::Ready { display, cookie } = server::prepare(options).await?;
        Ok(Lease(Arc::new(Self {
            display,
            cookie,
            fake: Zeroizing::new(*uuid::Uuid::new_v4().as_bytes()),
            enabled: AtomicBool::new(false),
            closed: watch::channel(false).0,
            sink,
        })))
    }

    pub fn stop(&self) {
        self.enabled.store(false, Ordering::Release);
        self.closed.send_replace(true);
    }

    pub async fn request(&self, channel: &mut Channel<client::Msg>) -> Result<()> {
        let cookie = self
            .fake
            .iter()
            .map(|value| format!("{value:02x}"))
            .collect::<String>();
        channel
            .request_x11(
                true,
                false,
                "MIT-MAGIC-COOKIE-1",
                cookie,
                u32::from(self.display.screen),
            )
            .await
            .map_err(|_| Error::X11Rejected)?;
        // This is the first channel request, so a success cannot belong to PTY
        // allocation or shell startup. Rejection is visible to the caller.
        match channel.wait().await {
            Some(ChannelMsg::Success) => {
                self.enabled.store(true, Ordering::Release);
                Ok(())
            }
            _ => Err(Error::X11Rejected),
        }
    }

    async fn relay(&self, channel: Channel<client::Msg>) -> Result<()> {
        let mut remote = channel.into_stream();
        let mut local = tokio::time::timeout(TIMEOUT, async {
            let packet = protocol::setup(&mut remote, &self.fake, &self.cookie).await?;
            let mut local = self.display.connect().await?;
            local
                .write_all(&packet)
                .await
                .map_err(|_| Error::X11Unavailable)?;
            Ok(local)
        })
        .await
        .map_err(|_| Error::X11Unavailable)??;
        // Established X clients may be idle indefinitely. Session/handler drop
        // aborts these bounded tasks and closes both ends immediately.
        tokio::io::copy_bidirectional(&mut remote, &mut local)
            .await
            .map_err(|_| Error::X11Unavailable)?;
        Ok(())
    }
}

/// The SSH handler owns the tasks; dropping it closes all forwarded connections.
pub(crate) struct Forwarder {
    state: Arc<State>,
    slots: Arc<Semaphore>,
    tasks: JoinSet<()>,
}
impl Forwarder {
    pub fn new(state: Arc<State>) -> Self {
        Self {
            state,
            slots: Arc::new(Semaphore::new(MAX_CHANNELS)),
            tasks: JoinSet::new(),
        }
    }

    pub async fn accept(
        &mut self,
        channel: Channel<client::Msg>,
        reply: client::ChannelOpenHandle,
    ) {
        while let Some(result) = self.tasks.try_join_next() {
            if result.is_err() {
                (self.state.sink)(Event::Error {
                    message: Error::X11Unavailable.to_string(),
                });
            }
        }
        if !self.state.enabled.load(Ordering::Acquire) {
            return;
        }
        let Ok(permit) = self.slots.clone().try_acquire_owned() else {
            return;
        };
        reply.accept().await;
        let state = self.state.clone();
        self.tasks.spawn(async move {
            let _permit = permit;
            let mut closed = state.closed.subscribe();
            if *closed.borrow() {
                return;
            }
            let result = tokio::select! {
                _ = closed.changed() => Ok(()),
                result = state.relay(channel) => result,
            };
            if let Err(error) = result {
                (state.sink)(Event::Error {
                    message: error.to_string(),
                });
            }
        });
    }
}

#[cfg(test)]
mod integration;
#[cfg(test)]
mod tests;
