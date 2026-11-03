//! A private app-server connection keeps naming traffic out of chat history and GUI events.
use super::{
    error::{GuiError, Result},
    identity, platform,
    releases::Executable,
    title_generation::{self, TitleRequest},
};
use serde_json::{json, Value};
use std::{path::PathBuf, process::Stdio, time::Duration};
use tokio::{
    io::{AsyncBufReadExt, AsyncWriteExt, BufReader, Lines},
    process::{Child, ChildStdin, ChildStdout},
    time::timeout,
};

const GENERATION_TIMEOUT: Duration = Duration::from_secs(40);
const MAX_OUTPUT_BYTES: usize = 16 * 1024;

#[cfg(test)]
#[path = "title_worker_test.rs"]
mod tests;

pub(super) async fn generate(
    binary: Executable,
    home: PathBuf,
    request: &TitleRequest,
) -> Result<String> {
    let mut worker = Worker::spawn(&binary, &home)?;
    let result = timeout(
        GENERATION_TIMEOUT,
        worker.generate(&binary.version, &home, request),
    )
    .await;
    if worker.process.kill().await.is_err() {
        eprintln!("Title generation process was already stopped");
    }
    result.map_err(|_| GuiError::Timeout)?
}

struct Worker {
    process: Child,
    writer: ChildStdin,
    reader: Lines<BufReader<ChildStdout>>,
    next_id: u64,
    output: TitleOutput,
}

impl Worker {
    fn spawn(binary: &Executable, home: &std::path::Path) -> Result<Self> {
        let mut command = super::cli_command::new(&binary.path);
        command
            .arg("app-server")
            .env("CODEX_HOME", home)
            .env(
                "CODEX_INTERNAL_ORIGINATOR_OVERRIDE",
                identity::CLI_ORIGINATOR,
            )
            .current_dir(home)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .kill_on_drop(true);
        platform::hide_window(&mut command);
        let mut process = command.spawn().map_err(|_| GuiError::Startup)?;
        let writer = process.stdin.take().ok_or(GuiError::Startup)?;
        let reader = BufReader::new(process.stdout.take().ok_or(GuiError::Startup)?).lines();
        Ok(Self {
            process,
            writer,
            reader,
            next_id: 1,
            output: TitleOutput::default(),
        })
    }

    async fn generate(
        &mut self,
        version: &str,
        home: &std::path::Path,
        request: &TitleRequest,
    ) -> Result<String> {
        self.rpc("initialize", identity::initialize_params(version))
            .await?;
        self.write(json!({"method": "initialized"})).await?;
        let started = self
            .rpc(
                "thread/start",
                title_generation::start_params(&request.settings, &platform::execution_path(home)),
            )
            .await?;
        let id = started["thread"]["id"].as_str().ok_or(GuiError::Rpc)?;
        self.output.thread_id = id.to_owned();
        self.rpc("turn/start", title_generation::turn_params(id, request))
            .await?;
        while !self.output.completed {
            self.next().await?;
        }
        title_generation::parse_title(&self.output.text)
    }

    async fn write(&mut self, value: Value) -> Result<()> {
        let mut bytes = serde_json::to_vec(&value).map_err(|_| GuiError::InvalidRequest)?;
        bytes.push(b'\n');
        self.writer
            .write_all(&bytes)
            .await
            .map_err(|_| GuiError::Disconnected)
    }

    async fn rpc(&mut self, method: &str, params: Value) -> Result<Value> {
        let id = self.next_id;
        self.next_id += 1;
        self.write(json!({"id": id, "method": method, "params": params}))
            .await?;
        loop {
            let message = self.next().await?;
            if message.get("method").is_some() || message["id"] != id {
                continue;
            }
            if message.get("error").is_some() {
                return Err(GuiError::from_rpc(&message["error"]));
            }
            return message.get("result").cloned().ok_or(GuiError::Rpc);
        }
    }

    async fn next(&mut self) -> Result<Value> {
        let line = self
            .reader
            .next_line()
            .await
            .map_err(|_| GuiError::Disconnected)?
            .ok_or(GuiError::Disconnected)?;
        let message: Value = serde_json::from_str(&line).map_err(|_| GuiError::Rpc)?;
        if message.get("method").is_some() && message.get("id").is_some() {
            self.write(json!({"id": message["id"], "error": {
                "code": -32601, "message": "Title generation does not support tool requests"
            }}))
            .await?;
            return Err(GuiError::Rpc);
        }
        self.output.observe(&message)?;
        Ok(message)
    }
}

#[derive(Default)]
pub(super) struct TitleOutput {
    pub(super) thread_id: String,
    pub(super) text: String,
    pub(super) completed: bool,
}

impl TitleOutput {
    pub(super) fn observe(&mut self, message: &Value) -> Result<()> {
        let params = &message["params"];
        if self.thread_id.is_empty() || params["threadId"].as_str() != Some(&self.thread_id) {
            return Ok(());
        }
        match message["method"].as_str() {
            Some("item/agentMessage/delta") => self
                .text
                .push_str(params["delta"].as_str().unwrap_or_default()),
            Some("item/completed") if params["item"]["type"] == "agentMessage" => {
                self.text = params["item"]["text"]
                    .as_str()
                    .unwrap_or_default()
                    .to_owned();
            }
            Some("turn/completed") => {
                if params["turn"]["status"] != "completed" {
                    return Err(GuiError::Rpc);
                }
                self.completed = true;
            }
            Some("error") if params["willRetry"] != true => return Err(GuiError::Rpc),
            _ => {}
        }
        if self.text.len() > MAX_OUTPUT_BYTES {
            return Err(GuiError::Rpc);
        }
        Ok(())
    }
}
