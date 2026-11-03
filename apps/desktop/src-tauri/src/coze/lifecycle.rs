use super::{
    install, platform, registration, root,
    state::{CozeState, Phase, Running, Status},
    Error, Result,
};
use std::{
    fs,
    io::{BufRead, BufReader, Write},
    process::{Command, Stdio},
    sync::mpsc,
    time::Duration,
};
use tauri::Manager;

pub(super) fn status(app: &tauri::AppHandle) -> Result<Status> {
    let state = app.state::<CozeState>();
    let progress = state.progress.lock().map_err(|_| Error::Storage)?.clone();
    let mut process = state.process.lock().map_err(|_| Error::Storage)?;
    if let Some(runtime) = process.as_mut() {
        if runtime
            .child
            .try_wait()
            .map_err(|_| Error::Startup)?
            .is_some()
        {
            process.take();
        }
    }
    Ok(Status {
        installed: install::installed(&root(app)?)?,
        version: install::registry()?.version,
        phase: progress.phase,
        downloaded: progress.downloaded,
        total: progress.total,
        url: process.as_ref().map(|runtime| runtime.url.clone()),
    })
}

pub(super) fn start(app: &tauri::AppHandle) -> Result<Status> {
    if status(app)?.url.is_some() {
        return status(app);
    }
    let root = root(app)?;
    if !install::installed(&root)? {
        return Err(Error::NotInstalled);
    }
    let state = app.state::<CozeState>();
    state.progress(Phase::Starting, 0, None)?;
    let proxy = crate::local_proxy::gui_runtime::ensure_started(app).map_err(|_| Error::Startup)?;
    let package = install::directory(&root)?;
    let data = root.join("data");
    platform::private_directory(&data)?;
    let token = format!(
        "{}{}",
        uuid::Uuid::new_v4().simple(),
        uuid::Uuid::new_v4().simple()
    );
    let bootstrap = serde_json::json!({"dataDir":data,"token":token,"proxyUrl":proxy,
        "proxyToken":crate::codex_config::LOCAL_PROXY_TOKEN});
    let log = fs::File::create(root.join("runtime.log")).map_err(|_| Error::Storage)?;
    let mut command = Command::new(package.join(platform::executable()));
    command
        .arg("--serve")
        .current_dir(&data)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(log);
    let mut runtime = Running {
        child: platform::spawn(&mut command)?,
        url: String::new(),
    };
    writeln!(
        runtime.child.stdin.as_mut().ok_or(Error::Startup)?,
        "{bootstrap}"
    )
    .map_err(|_| Error::Startup)?;
    let ready = read_ready(&mut runtime)?;
    if ready["version"] != install::registry()?.version {
        return Err(Error::Startup);
    }
    let url = ready["url"].as_str().ok_or(Error::Startup)?;
    let parsed = url::Url::parse(url).map_err(|_| Error::Startup)?;
    if parsed.scheme() != "http" || parsed.host_str() != Some("127.0.0.1") {
        return Err(Error::Startup);
    }
    let state_file = root.join("runtime.json");
    crate::storage::write_text_if_changed(
        &state_file,
        &serde_json::json!({"url":url,"token":token}).to_string(),
    )
    .map_err(|_| Error::Storage)?;
    registration::register(app, &package.join(platform::executable()), &state_file)?;
    runtime.url = format!("{url}/#token={token}");
    *state.process.lock().map_err(|_| Error::Storage)? = Some(runtime);
    status(app)
}

fn read_ready(runtime: &mut Running) -> Result<serde_json::Value> {
    let stdout = runtime.child.stdout.take().ok_or(Error::Startup)?;
    let (sender, receiver) = mpsc::sync_channel(1);
    std::thread::Builder::new()
        .name("coze-ready".into())
        .spawn(move || {
            let mut line = String::new();
            let result = std::io::Read::take(BufReader::new(stdout), 4096)
                .read_line(&mut line)
                .map(|_| line)
                .map_err(|_| Error::Startup);
            // A timeout means the parent has already abandoned this launch.
            if sender.send(result).is_err() {
                eprintln!("Coze launch was abandoned");
            }
        })
        .map_err(|_| Error::Startup)?;
    let line = receiver
        .recv_timeout(Duration::from_secs(15))
        .map_err(|_| Error::Startup)??;
    let ready = serde_json::from_str(&line).map_err(|_| Error::Startup)?;
    Ok(ready)
}

pub(crate) fn restore(app: &tauri::AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let attempt = || -> Result<()> {
            if !install::installed(&root(&app)?)? {
                return Ok(());
            }
            let state = app.state::<CozeState>();
            let _operation = state.begin()?;
            start(&app)?;
            Ok(())
        };
        if let Err(error) = attempt() {
            eprintln!("Could not restore Coze: {error}");
        }
    });
}

pub(super) fn stop(app: &tauri::AppHandle) -> Result<Status> {
    let runtime = app
        .state::<CozeState>()
        .process
        .lock()
        .map_err(|_| Error::Storage)?
        .take();
    drop(runtime);
    status(app)
}
