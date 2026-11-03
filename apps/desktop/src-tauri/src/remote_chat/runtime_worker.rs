//! Keep socket work and IPC recovery deadlines off the UI thread.
use super::{Config, Runtime, POLL_INTERVAL};
use crate::remote_chat::protocol::Command;
use tokio::sync::{mpsc, watch};

const COMMANDS_PER_TICK: usize = 64;

pub(in crate::remote_chat) fn run(
    mut runtime: Runtime,
    mut commands: mpsc::Receiver<Command>,
    mut configs: watch::Receiver<Option<Config>>,
) {
    loop {
        for _ in 0..COMMANDS_PER_TICK {
            match commands.try_recv() {
                Ok(command) => runtime.command(command),
                Err(mpsc::error::TryRecvError::Empty) => break,
                Err(mpsc::error::TryRecvError::Disconnected) => return,
            }
        }
        if configs.has_changed().unwrap_or(false) {
            runtime.configure(configs.borrow_and_update().clone());
        }
        runtime.tick();
        if runtime.socket.is_none() {
            std::thread::sleep(POLL_INTERVAL);
        }
    }
}
