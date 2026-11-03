//! Run only a named script from the selected package, with its own terminal lifetime.
use super::{platform, types::*};
use portable_pty::CommandBuilder;
use std::{io::Read, path::Path};

const MAX_PACKAGE_BYTES: u64 = 5 * 1024 * 1024;
const SCRIPT_ENV: &str = "REMOTE_AI_NPM_SCRIPT";

pub(super) fn command(cwd: &Path, name: &str) -> Result<(CommandBuilder, String)> {
    validate(cwd, name)?;
    let (mut command, _) = platform::shell(cwd)?;
    configure(&mut command);
    // The script name is data, never interpolated into shell source.
    command.env(SCRIPT_ENV, name);
    Ok((command, format!("npm run {name}")))
}

fn validate(cwd: &Path, name: &str) -> Result<()> {
    if name.is_empty() || name.len() > 1024 || name.chars().any(char::is_control) {
        return Err(TerminalError::Script);
    }
    let file = std::fs::File::open(cwd.join("package.json")).map_err(|_| TerminalError::Script)?;
    let mut bytes = Vec::new();
    file.take(MAX_PACKAGE_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| TerminalError::Script)?;
    if bytes.len() as u64 > MAX_PACKAGE_BYTES {
        return Err(TerminalError::Script);
    }
    let package: serde_json::Value =
        serde_json::from_slice(&bytes).map_err(|_| TerminalError::Script)?;
    if package
        .get("scripts")
        .and_then(|scripts| scripts.get(name))
        .and_then(|value| value.as_str())
        .is_none()
    {
        return Err(TerminalError::Script);
    }
    Ok(())
}

#[cfg(windows)]
fn configure(command: &mut CommandBuilder) {
    command.args(["-NoProfile", "-NonInteractive", "-Command", WINDOWS_RUN]);
}

// Invoke npm's JS entry directly: npm.cmd would reinterpret metacharacters in a script name.
// npm installs npm-cli.js next to its Windows launchers, including npm installed through nvm.
// Exact application lookups can return multiple installations; use the first PATH match.
// Node reads the script name from the environment because Windows PowerShell strips native argument quotes.
#[cfg(windows)]
const WINDOWS_RUN: &str = r#"$ErrorActionPreference = 'Stop';
$npm = (Get-Command npm.cmd -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source;
$directory = Split-Path -LiteralPath $npm;
$cli = Join-Path $directory 'node_modules/npm/bin/npm-cli.js';
$node = Join-Path $directory 'node.exe';
if (!(Test-Path -LiteralPath $node)) {
  $node = (Get-Command node.exe -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source
};
$env:REMOTE_AI_NPM_CLI_PATH = $cli;
$run = 'process.argv.push(process.env.REMOTE_AI_NPM_SCRIPT);require(process.env.REMOTE_AI_NPM_CLI_PATH)';
& $node -e $run $cli run --;
exit $LASTEXITCODE"#;

#[cfg(not(windows))]
fn configure(command: &mut CommandBuilder) {
    command.args(["-c", "exec npm run -- \"$REMOTE_AI_NPM_SCRIPT\""]);
}

/// Stop descendants as well as npm so development servers release their listening ports.
#[cfg(windows)]
pub(super) fn stop_tree(id: u32) -> std::io::Result<()> {
    use std::{os::windows::process::CommandExt, path::PathBuf, process::Command};
    use windows_sys::Win32::System::Threading::CREATE_NO_WINDOW;
    let system = std::env::var_os("SystemRoot")
        .ok_or_else(|| std::io::Error::other("missing SystemRoot"))?;
    let status = Command::new(PathBuf::from(system).join("System32/taskkill.exe"))
        .args(["/PID", &id.to_string(), "/T", "/F"])
        .creation_flags(CREATE_NO_WINDOW)
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()?;
    if status.success() {
        Ok(())
    } else {
        Err(std::io::Error::other("process tree did not stop"))
    }
}

#[cfg(not(windows))]
pub(super) fn stop_tree(id: u32) -> std::io::Result<()> {
    // portable-pty creates a new session whose process group is this child's PID.
    // End option parsing so procps kill treats the negative ID as a process group, not a signal.
    let status = std::process::Command::new("/bin/kill")
        .args(["-KILL", "--", &format!("-{id}")])
        .status()?;
    if status.success() {
        Ok(())
    } else {
        Err(std::io::Error::other("process group did not stop"))
    }
}

#[cfg(test)]
#[path = "npm_tests.rs"]
mod tests;

#[cfg(all(test, windows))]
#[path = "npm_windows_tests.rs"]
mod windows_tests;
