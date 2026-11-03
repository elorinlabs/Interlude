//! Only the validated Antigravity installation and its loopback service may be controlled.
use super::model::{Error, Result};
use std::sync::Mutex;
use std::{
    path::{Path, PathBuf},
    process::Command,
    time::{Duration, Instant},
};
use sysinfo::System;

static LAST_INSTALLATION: Mutex<Option<PathBuf>> = Mutex::new(None);

fn validated_shell(path: &Path) -> Option<PathBuf> {
    let path = path.canonicalize().ok()?;
    if !path.file_name()?.eq_ignore_ascii_case("Antigravity.exe") {
        return None;
    }
    let root = path.parent()?;
    (path.is_file()
        && root.join("resources/app.asar").is_file()
        && root.join("resources/bin/language_server.exe").is_file())
    .then_some(path)
}

fn executable() -> Result<PathBuf> {
    // Prefer the installation actually running: users can move the app away from Programs.
    let system = System::new_all();
    let mut candidates: Vec<_> = system
        .processes()
        .values()
        .filter(|p| p.name().eq_ignore_ascii_case("Antigravity.exe"))
        .filter_map(|p| p.exe().and_then(validated_shell))
        .collect();
    candidates.sort();
    candidates.dedup();
    if candidates.len() > 1 {
        return Err(Error::Unavailable);
    }
    let mut cached = LAST_INSTALLATION.lock().map_err(|_| Error::Unavailable)?;
    if let Some(path) = candidates.pop() {
        *cached = Some(path.clone());
        return Ok(path);
    }
    if let Some(path) = cached.as_ref().and_then(|p| validated_shell(p)) {
        return Ok(path);
    }
    let path = dirs::data_local_dir()
        .ok_or(Error::Unavailable)?
        .join("Programs/antigravity/Antigravity.exe");
    let path = validated_shell(&path).ok_or(Error::Unavailable)?;
    *cached = Some(path.clone());
    Ok(path)
}

pub(super) fn installed() -> bool {
    executable().is_ok()
}
pub(super) fn installation() -> Result<PathBuf> {
    executable()
}
pub(super) fn prefer(path: &Path) -> Result<()> {
    if !path.is_absolute() {
        return Err(Error::Unavailable);
    }
    let path = validated_shell(path).ok_or(Error::Unavailable)?;
    let mut cached = LAST_INSTALLATION.lock().map_err(|_| Error::Unavailable)?;
    if cached.is_none() {
        *cached = Some(path);
    }
    Ok(())
}

fn belongs(path: &Path, shell: &Path) -> bool {
    let Ok(path) = path.canonicalize() else {
        return false;
    };
    path == shell
        || shell
            .parent()
            .is_some_and(|root| path == root.join("resources/bin/language_server.exe"))
}

pub(super) fn launch() -> Result<()> {
    #[cfg(not(windows))]
    return Err(Error::Unavailable);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let shell = executable()?;
        let system = System::new_all();
        if system.processes().values().filter(|p| {
            p.exe().and_then(validated_shell).as_ref() == Some(&shell)
        }).any(|p| crate::windows_client_processes::bring_window_for_pid(p.pid().as_u32())) {
            return Ok(());
        }
        Command::new(shell)
            .env_remove("ELECTRON_RUN_AS_NODE")
            .creation_flags(0x08000000)
            .spawn()
            .map_err(|_| Error::Unavailable)?;
        Ok(())
    }
}

pub(super) fn stop() -> Result<()> {
    let shell = executable()?;
    let deadline = Instant::now() + Duration::from_secs(8);
    loop {
        let system = System::new_all();
        let processes: Vec<_> = system
            .processes()
            .values()
            .filter(|p| p.exe().is_some_and(|path| belongs(path, &shell)))
            .collect();
        if processes.is_empty() {
            return Ok(());
        }
        if Instant::now() >= deadline {
            return Err(Error::Switch);
        }
        for process in processes {
            if !process.kill() {
                return Err(Error::Switch);
            }
        }
        std::thread::sleep(Duration::from_millis(150));
    }
}

pub(super) struct Endpoint {
    port: u16,
    csrf: String,
}

fn flag(process: &sysinfo::Process, name: &str) -> Option<String> {
    let args = process.cmd();
    for (index, arg) in args.iter().enumerate() {
        let text = arg.to_string_lossy();
        if text == name {
            return args
                .get(index + 1)
                .map(|s| s.to_string_lossy().into_owned());
        }
        if let Some(value) = text.strip_prefix(&format!("{name}=")) {
            return Some(value.to_string());
        }
    }
    None
}

fn ports(pid: sysinfo::Pid) -> Result<Vec<u16>> {
    #[cfg(not(windows))]
    {
        let _ = pid;
        Err(Error::Unavailable)
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let output = Command::new("powershell.exe").args(["-NoProfile","-NonInteractive","-Command",
            &format!("Get-NetTCPConnection -OwningProcess {} -State Listen -ErrorAction SilentlyContinue | Where-Object LocalAddress -eq '127.0.0.1' | Select-Object -ExpandProperty LocalPort",pid.as_u32())])
            .creation_flags(0x08000000).output().map_err(|_|Error::Connection)?;
        if !output.status.success() {
            return Err(Error::Connection);
        }
        Ok(String::from_utf8_lossy(&output.stdout)
            .lines()
            .filter_map(|s| s.trim().parse().ok())
            .collect())
    }
}

fn endpoints() -> Result<Vec<Endpoint>> {
    let shell = executable()?;
    let system = System::new_all();
    let server = system
        .processes()
        .values()
        .find(|p| {
            p.name().eq_ignore_ascii_case("language_server.exe")
                && p.exe().is_some_and(|path| belongs(path, &shell))
        })
        .ok_or(Error::Connection)?;
    let csrf = flag(server, "--csrf_token")
        .filter(|s| !s.is_empty())
        .ok_or(Error::Connection)?;
    let port: u16 = flag(server, "--https_server_port")
        .and_then(|s| s.parse().ok())
        .unwrap_or(0);
    let ports: Vec<_> = ports(server.pid())?
        .into_iter()
        .filter(|observed| port == 0 || *observed == port)
        .collect();
    Ok(ports
        .into_iter()
        .map(|port| Endpoint {
            port,
            csrf: csrf.clone(),
        })
        .collect())
}

/// TLS is accepted only for loopback ports owned by the validated local server; proxies are disabled.
pub(super) fn rpc(method: &str, timeout: Duration) -> Result<serde_json::Value> {
    if !matches!(method, "GetUserStatus" | "LoginWithBrowser") {
        return Err(Error::Connection);
    }
    let client = reqwest::blocking::Client::builder()
        .no_proxy()
        .redirect(reqwest::redirect::Policy::none())
        .danger_accept_invalid_certs(true)
        .connect_timeout(Duration::from_secs(2))
        .timeout(timeout)
        .build()
        .map_err(|_| Error::Connection)?;
    for endpoint in endpoints()? {
        let response = client
            .post(format!(
                "https://127.0.0.1:{}/exa.language_server_pb.LanguageServerService/{method}",
                endpoint.port
            ))
            .header("x-codeium-csrf-token", endpoint.csrf)
            .header("Connect-Protocol-Version", "1")
            .json(&serde_json::json!({}))
            .send();
        if let Ok(response) = response {
            if !response.status().is_success() {
                return Err(Error::Connection);
            }
            use std::io::Read;
            let mut bytes = Vec::new();
            response
                .take(2_097_153)
                .read_to_end(&mut bytes)
                .map_err(|_| Error::Connection)?;
            if bytes.len() > 2_097_152 {
                return Err(Error::Connection);
            }
            return serde_json::from_slice(&bytes).map_err(|_| Error::Connection);
        }
    }
    Err(Error::Connection)
}
