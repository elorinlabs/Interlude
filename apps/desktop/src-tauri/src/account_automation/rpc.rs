//! Short-lived, identified Codex protocol clients. Never attach to another process's stdio.
use std::{path::{Path,PathBuf},process::Stdio,time::Duration};
use serde_json::{json,Value};
use tokio::{io::{AsyncBufReadExt,AsyncWriteExt,BufReader,Lines},process::{Child,ChildStdin,ChildStdout,Command}};

pub(crate) struct Rpc {
    child:Child, input:ChildStdin, lines:Lines<BufReader<ChildStdout>>, next:u64,
}
pub(crate) fn executable()->Result<PathBuf,String> {
    let mut system=sysinfo::System::new();
    system.refresh_processes_specifics(sysinfo::ProcessesToUpdate::All,true,sysinfo::ProcessRefreshKind::nothing().with_exe(sysinfo::UpdateKind::OnlyIfNotSet));
    let mut candidates:Vec<PathBuf>=system.processes().values().filter_map(|process|process.exe()).filter(|path|path.file_name().is_some_and(|name|name.to_string_lossy().eq_ignore_ascii_case("codex.exe"))).map(Path::to_path_buf).collect();
    if let Some(local)=std::env::var_os("LOCALAPPDATA") {
        let root=PathBuf::from(local).join("OpenAI/Codex/bin");
        if let Ok(entries)=std::fs::read_dir(root) {
            candidates.extend(entries.flatten().map(|entry|entry.path().join("codex.exe")).filter(|path|path.is_file()));
        }
    }
    if let Some(path)=std::env::var_os("PATH") {
        candidates.extend(std::env::split_paths(&path).map(|root|root.join(if cfg!(windows){"codex.exe"}else{"codex"})).filter(|path|path.is_file()));
    }
    candidates.into_iter().find(|path|path.is_file()).ok_or_else(||"cliUnavailable".into())
}
impl Rpc {
    pub(crate) async fn start(home:&Path)->Result<Self,String> {
        let executable=tauri::async_runtime::spawn_blocking(executable).await.map_err(|_|"cliUnavailable")??;
        let mut command=Command::new(executable);
        command.arg("app-server").arg("--stdio").env("CODEX_HOME",home)
            .env("CODEX_INTERNAL_ORIGINATOR_OVERRIDE", "codex-tui")
            .stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::null()).kill_on_drop(true);
        #[cfg(windows)] { command.creation_flags(0x08000000); }
        let mut child=command.spawn().map_err(|_|"cliUnavailable")?;
        let input=child.stdin.take().ok_or("automationFailed")?;
        let lines=BufReader::new(child.stdout.take().ok_or("automationFailed")?).lines();
        let mut rpc=Self{child,input,lines,next:1};
        rpc.request("initialize",json!({"clientInfo":{"name":"codex-tui","version":"0.1.0","title":"Interlude"},"capabilities":{"experimentalApi":true}})).await?;
        rpc.write(json!({"method":"initialized"})).await?;
        Ok(rpc)
    }
    async fn write(&mut self,value:Value)->Result<(),String> {
        let mut line=serde_json::to_vec(&value).map_err(|_|"automationFailed")?;line.push(b'\n');
        self.input.write_all(&line).await.map_err(|_|"automationFailed".into())
    }
    async fn read(&mut self)->Result<Value,String> {
        let line=tokio::time::timeout(Duration::from_secs(45),self.lines.next_line()).await.map_err(|_|"automationTimedOut")?
            .map_err(|_|"automationFailed")?.ok_or("automationFailed")?;
        if line.len()>8*1024*1024 {return Err("automationFailed".into());}
        serde_json::from_str(&line).map_err(|_|"automationFailed".into())
    }
    pub(crate) async fn request(&mut self,method:&str,params:Value)->Result<Value,String> {
        let id=self.next;self.next+=1;
        self.write(json!({"id":id,"method":method,"params":params})).await?;
        let deadline=tokio::time::Instant::now()+Duration::from_secs(90);
        loop {
            let message=tokio::time::timeout_at(deadline,self.read()).await.map_err(|_|"automationTimedOut")??;
            if message.get("id").and_then(Value::as_u64)==Some(id) && message.get("method").is_none() {
                if message.get("error").is_some(){return Err("protocolUnavailable".into());}
                return Ok(message.get("result").cloned().unwrap_or(Value::Null));
            }
            if message.get("id").is_some() && message.get("method").is_some() {
                self.write(json!({"id":message["id"],"error":{"code":-32000,"message":"Interactive approval is required"}})).await?;
                return Err("interactionRequired".into());
            }
        }
    }
    pub(crate) async fn stop(mut self) {let _=self.child.kill().await;let _=self.child.wait().await;}
}

pub(crate) async fn greet(home:&Path,allowed:impl Fn()->bool)->Result<i64,String> {
    let mut rpc=Rpc::start(home).await?;
    let result=tokio::time::timeout(Duration::from_secs(150),async {
        if !allowed(){return Err("automationCancelled".into());}
        let thread=rpc.request("thread/start",json!({"ephemeral":true,"cwd":home,"approvalPolicy":"never","sandbox":"read-only","developerInstructions":"Reply with a short greeting only. Do not use tools or access files."})).await?;
        let id=thread.pointer("/thread/id").and_then(Value::as_str).ok_or("automationFailed")?;
        if !allowed(){return Err("automationCancelled".into());}
        rpc.request("turn/start",json!({"threadId":id,"input":[{"type":"text","text":"你好","text_elements":[]}]})).await?;
        let accepted_at=chrono::Utc::now().timestamp();
        loop {
            let message=rpc.read().await?;
            if message.get("id").is_some() && message.get("method").is_some() {return Err("interactionRequired".into());}
            if message.get("method").and_then(Value::as_str)==Some("turn/completed") {
                return if message.pointer("/params/turn/status").and_then(Value::as_str)==Some("completed"){Ok(accepted_at)}else{Err("sendUncertain".into())};
            }
        }
    }).await.map_err(|_|"sendUncertain".to_string()).and_then(|value|value);
    rpc.stop().await;result
}

/// Updating an unloaded persisted goal avoids starting a competing generation process.
pub(crate) async fn activate_goal(home:&Path,thread_id:&str,goal_id:&str)->Result<(),String> {
    let mut rpc=Rpc::start(home).await?;
    let result=async {
        let before=rpc.request("thread/goal/get",json!({"threadId":thread_id})).await?;
        let goal=before.get("goal").ok_or("goalChanged")?;
        let persisted=super::goals::read_goal_home(home,thread_id)?;
        if persisted.goal_id!=goal_id || !interlude_account_switch::automation::can_relay(&persisted.status,persisted.tokens_used,persisted.token_budget) {return Err("goalChanged".into());}
        let after=rpc.request("thread/goal/set",json!({"threadId":thread_id,"status":"active","origin":"user"})).await?;
        if after.pointer("/goal/objective")!=goal.get("objective") || after.pointer("/goal/tokenBudget")!=goal.get("tokenBudget")
            || after.pointer("/goal/tokensUsed")!=goal.get("tokensUsed") {return Err("goalChanged".into());}
        Ok(())
    }.await;
    rpc.stop().await;result
}
