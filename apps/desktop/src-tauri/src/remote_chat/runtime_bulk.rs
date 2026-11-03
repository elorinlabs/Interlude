//! Binary records share authenticated session ownership, independently of chat JSON delivery.
use super::{ChatError, Message, Runtime};

impl Runtime {
    pub(super) fn receive_bulk(&mut self, bytes: Vec<u8>) -> Result<(), ChatError> {
        let session = super::super::bulk::session_id(&bytes)?;
        if !self.binary_bulk || !self.sessions.contains(&session) {
            return Err(ChatError::InvalidFrame);
        }
        self.bulk.enqueue(bytes, Some(&session))
    }

    pub(super) fn send_bulk(&mut self, request: super::super::bulk::BulkSend) {
        let valid = self.is_client(&request.client_id)
            && request.generation == self.generation
            && self.sessions.contains(&request.session_id)
            && self.binary_bulk;
        let result = if valid && !request.completed.is_closed() {
            request.frames.into_iter().try_for_each(|frame| {
                if request.completed.is_closed() {
                    return Err(ChatError::InvalidFrame);
                }
                self.write(Message::Binary(frame.into()))
            })
        } else {
            Err(ChatError::InvalidFrame)
        };
        if matches!(result, Err(ChatError::Transport)) {
            self.disconnect();
        }
        // A cancelled frontend no longer needs its write result; transport failure is already handled.
        let _cancelled = request.completed.send(result);
    }
}
