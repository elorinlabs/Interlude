use super::{continuation, response};
use crate::local_proxy::request_error::{RequestError, Stage};
use serde_json::{json, Value};
use std::io::{self, BufRead, Read};

pub(super) struct GenerateContentReader<R> {
    source: R,
    pending: io::Cursor<Vec<u8>>,
    data: String,
    state: response::State,
    scope: Option<continuation::Scope>,
    history: Option<super::history::Pending>,
    completed: bool,
}

impl<R: BufRead> GenerateContentReader<R> {
    pub(super) fn new(source: R, scope: Option<continuation::Scope>) -> Self {
        Self {
            source,
            pending: io::Cursor::new(Vec::new()),
            data: String::new(),
            state: response::State::default(),
            scope,
            history: None,
            completed: false,
        }
    }

    fn emit(&mut self, value: Value) {
        self.pending = io::Cursor::new(format!("data: {value}\n\n").into_bytes());
    }

    pub(super) fn with_history(mut self, history: Option<super::history::Pending>) -> Self {
        self.history = history;
        self
    }

    fn event(&mut self) -> io::Result<()> {
        if self.data.is_empty() {
            return Ok(());
        }
        let value: Value = serde_json::from_str(&std::mem::take(&mut self.data))
            .map_err(|error| io::Error::other(RequestError::json(Stage::Gemini, &error)))?;
        let delta = self
            .state
            .observe(&value)
            .map_err(|error| io::Error::other(error.detail()))?;
        self.emit(json!({ "choices": [{ "index": 0, "delta": delta }], "usage": response::usage(&self.state.usage) }));
        Ok(())
    }

    fn finish(&mut self) {
        match self.state.finish_reason() {
            Ok(reason) => {
                self.state.capture(self.scope.as_ref());
                if self.state.reason.as_deref() == Some("STOP") {
                    if let Some(history) = &self.history {
                        history.capture(&self.state.parts, &self.state.calls);
                    }
                }
                self.emit(
                    json!({ "choices": [{ "index": 0, "delta": {"annotations":self.state.annotations()}, "finish_reason": reason }],
                    "usage": response::usage(&self.state.usage) }),
                );
            }
            Err(error) => self.fail(error.detail()),
        }
        self.completed = true;
    }

    fn fail(&mut self, error: RequestError) {
        self.emit(
            json!({ "error": { "type": "api_error", "message": error.wire() },
            "usage": response::usage(&self.state.usage) }),
        );
        self.completed = true;
    }

    fn read_line(&mut self) -> io::Result<bool> {
        let mut line = String::new();
        let count = self.source.read_line(&mut line)?;
        if count == 0 {
            if !self.data.is_empty() {
                self.event()?;
                return Ok(true);
            }
            return Ok(false);
        }
        let line = line.trim_end_matches(['\r', '\n']);
        if line.is_empty() {
            self.event()?;
            return Ok(true);
        }
        if let Some(data) = line.strip_prefix("data:") {
            if !self.data.is_empty() {
                self.data.push('\n')
            }
            self.data.push_str(data.strip_prefix(' ').unwrap_or(data));
        }
        Ok(true)
    }
}

impl<R: BufRead> Read for GenerateContentReader<R> {
    fn read(&mut self, target: &mut [u8]) -> io::Result<usize> {
        if target.is_empty() {
            return Ok(0);
        }
        loop {
            let count = self.pending.read(target)?;
            if count > 0 || self.completed {
                return Ok(count);
            }
            match self.read_line() {
                Ok(true) => {}
                Ok(false) => self.finish(),
                Err(error) => self.fail(RequestError::io(Stage::Gemini, &error)),
            }
        }
    }
}
