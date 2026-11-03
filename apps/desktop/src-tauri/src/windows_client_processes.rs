//! Process control is limited to validated desktop installation paths.

use std::{
    fmt,
    path::{Path, PathBuf},
    thread,
    time::{Duration, Instant},
};

use sysinfo::{ProcessRefreshKind, ProcessesToUpdate, System, UpdateKind};

mod native;

const DESKTOP_SHELL: &str = "ChatGPT.exe";
const DESKTOP_HELPER: &str = "codex.exe";
const EXIT_POLL_INTERVAL: Duration = Duration::from_millis(150);
const STOP_TIMEOUT: Duration = Duration::from_secs(10);

#[derive(Debug)]
pub(crate) enum ProcessControlError {
    UnverifiedInstallation,
    ExitTimedOut,
    RestartedDuringStop,
}

impl fmt::Display for ProcessControlError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(match self {
            Self::UnverifiedInstallation => "无法确认桌面应用的位置，已取消重启。",
            Self::ExitTimedOut => "桌面应用尚未完全退出，请关闭后重试。",
            Self::RestartedDuringStop => "桌面应用已重新启动，已取消本次操作，请稍后重试。",
        })
    }
}

impl std::error::Error for ProcessControlError {}

struct ObservedProcess {
    pid: u32,
    started_at: u64,
    executable: PathBuf,
}

fn same_process_instance(left: &ObservedProcess, right: &ObservedProcess) -> bool {
    left.pid == right.pid
        && left.started_at == right.started_at
        && path_key(&left.executable) == path_key(&right.executable)
}

fn path_key(path: &Path) -> String {
    // MSIX installations on another volume appear through a WindowsApps junction.
    // Process APIs report the C: alias while validation resolves the D: target.
    let resolved = path.canonicalize().unwrap_or_else(|_| path.to_path_buf());
    let value = resolved.to_string_lossy().replace('/', "\\");
    if let Some(value) = value.strip_prefix(r"\\?\UNC\") {
        return format!(r"\\{value}").to_ascii_lowercase();
    }
    value
        .strip_prefix(r"\\?\")
        .unwrap_or(&value)
        .to_ascii_lowercase()
}

fn is_named(path: &Path, name: &str) -> bool {
    path.file_name()
        .is_some_and(|value| value.eq_ignore_ascii_case(name))
}

fn desktop_shell_candidate(executable: &Path) -> Option<PathBuf> {
    let parent = executable.parent()?;
    let app_dir = if is_named(executable, DESKTOP_SHELL) {
        parent
    } else if is_named(executable, DESKTOP_HELPER) && is_named(parent, "resources") {
        parent.parent()?
    } else {
        return None;
    };
    is_named(app_dir, "app").then(|| app_dir.join(DESKTOP_SHELL))
}

fn matches_install_executable(executable: &Path, shell: &Path) -> bool {
    let Some(app_dir) = shell.parent() else {
        return false;
    };
    let executable_key = path_key(executable);
    if executable_key == path_key(shell)
        || executable_key == path_key(&app_dir.join("resources").join(DESKTOP_HELPER))
    {
        return true;
    }
    // Only the desktop helper and its per-session sandbox belong to this app
    // shutdown. The same directory also contains codex-windows-sandbox-service.exe,
    // a SYSTEM-owned Windows service which remains alive after the app exits.
    let resources = app_dir.join("resources");
    let Some(parent) = executable.parent() else { return false; };
    if path_key(parent) != path_key(&resources) {
        return false;
    }
    is_named(executable, "codex-windows-sandbox.exe")
}

fn validated_shell(shell: &Path) -> Option<PathBuf> {
    let shell = shell.canonicalize().ok()?;
    if !shell.is_file()
        || desktop_shell_candidate(&shell)
            .is_none_or(|candidate| path_key(&candidate) != path_key(&shell))
    {
        return None;
    }
    let helper = shell.parent()?.join("resources").join(DESKTOP_HELPER);
    // A redirected helper must not extend process control beyond this installation.
    if !helper.is_file() || path_key(&helper.canonicalize().ok()?) != path_key(&helper) {
        return None;
    }
    Some(shell)
}

fn process_snapshot() -> System {
    let mut system = System::new();
    system.refresh_processes_specifics(
        ProcessesToUpdate::All,
        true,
        ProcessRefreshKind::nothing().with_exe(UpdateKind::OnlyIfNotSet),
    );
    system
}

fn desktop_shells(system: &System) -> Vec<PathBuf> {
    let mut shells: Vec<PathBuf> = Vec::new();
    for process in system.processes().values() {
        let Some(shell) = process
            .exe()
            .and_then(desktop_shell_candidate)
            .and_then(|path| validated_shell(&path))
        else {
            continue;
        };
        if !shells
            .iter()
            .any(|existing| path_key(existing) == path_key(&shell))
        {
            shells.push(shell);
        }
    }
    shells
}

/// Finds shells using executable paths and the desktop's bundled helper layout.
/// A standalone CLI, including one named `codex.exe`, never qualifies by name alone.
pub(crate) fn running_desktop_shells() -> Vec<PathBuf> {
    desktop_shells(&process_snapshot())
}

pub(crate) fn desktop_is_running() -> bool {
    !running_desktop_shells().is_empty()
}

pub(crate) fn activate_desktop() -> Result<(), String> {
    submit_desktop_activation()?;
    wait_for_desktop_window()?;
    Ok(())
}

pub(crate) fn submit_desktop_activation() -> Result<u32, String> {
    native::activate_desktop().map_err(|error| {
        eprintln!("Codex package activation failed: HRESULT={:?}", error.code());
        "switchFailed".to_string()
    })
}

pub(crate) fn wait_for_desktop_window() -> Result<u32, String> {
    let deadline = Instant::now() + Duration::from_secs(20);
    while Instant::now() < deadline {
        if let Some(pid) = visible_desktop_window_pid() {
            return Ok(pid);
        }
        thread::sleep(Duration::from_millis(250));
    }
    eprintln!("Codex activation returned without a visible desktop window");
    Err("switchFailed".to_string())
}

pub(crate) fn bring_desktop_window_to_front() -> bool {
    visible_desktop_window_pid().is_some()
}

fn visible_desktop_window_pid() -> Option<u32> {
    let system = process_snapshot();
    system.processes().values().find_map(|process| {
        let shell = process.exe().and_then(desktop_shell_candidate)?;
        validated_shell(&shell)?;
        let pid = process.pid().as_u32();
        native::bring_process_window_to_front(pid).then_some(pid)
    })
}

pub(crate) fn bring_window_for_pid(pid: u32) -> bool {
    native::bring_process_window_to_front(pid)
}

/// Stops only shells/helpers in the installations observed when this operation starts.
pub(crate) fn stop_desktop_processes() -> Result<(), ProcessControlError> {
    let mut shells = running_desktop_shells();
    // A failed launch can leave only the sandbox helper. It has no window and
    // is not a desktop shell, but must be reaped before activating the package.
    if let Some(current) = crate::dream_skin_native::detect_chatgpt_executable() {
        if !shells.iter().any(|shell| path_key(shell) == path_key(&current)) {
            shells.push(current);
        }
    }
    for shell in shells {
        stop_install_processes(&shell, STOP_TIMEOUT)?;
    }
    Ok(())
}

/// Waits without terminating a new installation that may have appeared during an update.
pub(crate) fn wait_for_desktop_exit(timeout: Duration) -> Result<(), ProcessControlError> {
    let deadline = Instant::now() + timeout;
    while desktop_is_running() {
        if Instant::now() >= deadline {
            return Err(ProcessControlError::ExitTimedOut);
        }
        thread::sleep(EXIT_POLL_INTERVAL);
    }
    Ok(())
}

fn observe_process(process: &sysinfo::Process) -> Option<ObservedProcess> {
    Some(ObservedProcess {
        pid: process.pid().as_u32(),
        started_at: process.start_time(),
        executable: process.exe()?.to_path_buf(),
    })
}

fn observed_processes_are_running(observed: &[ObservedProcess]) -> bool {
    let system = process_snapshot();
    observed.iter().any(|expected| {
        system
            .process(sysinfo::Pid::from_u32(expected.pid))
            .and_then(observe_process)
            .is_some_and(|current| same_process_instance(&current, expected))
    })
}

fn check_installation_exit(
    shell: &Path,
    remaining: &[ObservedProcess],
) -> Result<(), ProcessControlError> {
    if remaining
        .iter()
        .any(|process| matches_install_executable(&process.executable, shell)
            && !is_sandbox_helper(&process.executable, shell))
    {
        return Err(ProcessControlError::RestartedDuringStop);
    }
    Ok(())
}

/// Stops only the initially observed processes in a confirmed installation.
/// Respawned processes and reused PIDs are never terminated by the exit wait.
pub(crate) fn stop_install_processes(
    shell: &Path,
    timeout: Duration,
) -> Result<(), ProcessControlError> {
    let shell = validated_shell(shell).ok_or(ProcessControlError::UnverifiedInstallation)?;
    let observed = process_snapshot()
        .processes()
        .values()
        .filter_map(observe_process)
        .filter(|process| matches_install_executable(&process.executable, &shell))
        .collect::<Vec<_>>();
    // The sandbox launcher may survive independently of the desktop window.
    // It must not prevent account replacement and a fresh main-app activation.
    let blocking = observed
        .iter()
        .filter(|process| !is_sandbox_helper(&process.executable, &shell))
        .map(|process| ObservedProcess {
            pid: process.pid,
            started_at: process.started_at,
            executable: process.executable.clone(),
        })
        .collect::<Vec<_>>();
    let close_requested = observed.iter().any(|process| {
        path_key(&process.executable) == path_key(&shell)
            && native::request_close_process_window(process.pid)
    });
    if close_requested {
        let graceful_deadline = Instant::now() + timeout.min(Duration::from_secs(5));
        while observed_processes_are_running(&blocking) && Instant::now() < graceful_deadline {
            thread::sleep(EXIT_POLL_INTERVAL);
        }
    }
    for process in &observed {
        // Verify the original PID, creation time and executable again before
        // forcing any process that ignored the normal window-close request.
        native::terminate_observed_process(process);
    }
    let deadline = Instant::now() + timeout;
    while observed_processes_are_running(&blocking) {
        if Instant::now() >= deadline {
            return Err(ProcessControlError::ExitTimedOut);
        }
        thread::sleep(EXIT_POLL_INTERVAL);
    }
    // A bootstrap may replace an observed process while it is exiting. Leave
    // that replacement untouched and cancel launch instead of reusing its runtime.
    let remaining = process_snapshot()
        .processes()
        .values()
        .filter_map(observe_process)
        .collect::<Vec<_>>();
    check_installation_exit(&shell, &remaining)
}

fn is_sandbox_helper(executable: &Path, shell: &Path) -> bool {
    let Some(app_dir) = shell.parent() else {
        return false;
    };
    let resources = app_dir.join("resources");
    executable.parent().is_some_and(|parent| path_key(parent) == path_key(&resources))
        && executable
            .file_name()
            .is_some_and(|name| name.eq_ignore_ascii_case("codex-windows-sandbox.exe"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_exact_package_sandbox_is_nonblocking_after_shutdown() {
        let shell = Path::new(r"C:\Program Files\WindowsApps\OpenAI.Codex_1\app\ChatGPT.exe");
        assert!(is_sandbox_helper(
            Path::new(r"C:\Program Files\WindowsApps\OpenAI.Codex_1\app\resources\codex-windows-sandbox.exe"),
            shell,
        ));
        assert!(!is_sandbox_helper(
            Path::new(r"C:\Program Files\WindowsApps\OpenAI.Codex_2\app\resources\codex-windows-sandbox.exe"),
            shell,
        ));
        assert!(!is_sandbox_helper(
            Path::new(r"C:\Program Files\WindowsApps\OpenAI.Codex_1\app\ChatGPT.exe"),
            shell,
        ));
        let sandbox = ObservedProcess {
            pid: 1,
            started_at: 1,
            executable: PathBuf::from(r"C:\Program Files\WindowsApps\OpenAI.Codex_1\app\resources\codex-windows-sandbox.exe"),
        };
        assert!(check_installation_exit(shell, &[sandbox]).is_ok());
    }

    #[test]
    fn installation_alias_and_resolved_target_match() {
        let root = tempfile::tempdir().unwrap();
        let target = root.path().join("target");
        std::fs::create_dir(&target).unwrap();
        std::fs::write(target.join("ChatGPT.exe"), b"fixture").unwrap();
        let alias = root.path().join("alias");
        let status = std::process::Command::new("cmd.exe")
            .args(["/c", "mklink", "/J"])
            .arg(&alias).arg(&target).output().unwrap();
        assert!(status.status.success());
        assert!(matches_install_executable(&alias.join("ChatGPT.exe"), &target.join("ChatGPT.exe")));
        // Remove only the junction itself, leaving the fixture target for TempDir.
        std::fs::remove_dir(alias).unwrap();
    }

    const SHELL: &str = r"C:\Program Files\WindowsApps\OpenAI.Codex_1\app\ChatGPT.exe";

    #[test]
    fn recognizes_only_desktop_shell_and_bundled_helper_layouts() {
        assert_eq!(
            desktop_shell_candidate(Path::new(SHELL)),
            Some(PathBuf::from(SHELL))
        );
        assert_eq!(
            desktop_shell_candidate(Path::new(
                r"C:\Program Files\WindowsApps\OpenAI.Codex_1\app\resources\codex.exe"
            )),
            Some(PathBuf::from(SHELL)),
        );
        for path in [
            r"C:\Users\user\AppData\Roaming\npm\codex.exe",
            r"C:\tools\codex.exe",
            r"C:\tools\ChatGPT.exe",
            r"C:\other\resources\codex.exe",
            r"C:\other\app\codex.exe",
        ] {
            assert_eq!(desktop_shell_candidate(Path::new(path)), None, "{path}");
        }
    }

    #[test]
    fn process_scope_excludes_other_versions_and_cli_paths() {
        let shell = Path::new(SHELL);
        assert!(matches_install_executable(shell, shell));
        assert!(matches_install_executable(
            Path::new(r"C:\Program Files\WindowsApps\OpenAI.Codex_1\app\resources\codex.exe"),
            shell
        ));
        for path in [
            r"C:\Program Files\WindowsApps\OpenAI.Codex_2\app\ChatGPT.exe",
            r"C:\Program Files\WindowsApps\OpenAI.Codex_2\app\resources\codex.exe",
            r"C:\tools\codex.exe",
            r"C:\Program Files\WindowsApps\OpenAI.Codex_1\app\resources\other\codex.exe",
        ] {
            assert!(
                !matches_install_executable(Path::new(path), shell),
                "{path}"
            );
        }
        assert!(matches_install_executable(
            Path::new(r"C:\Program Files\WindowsApps\OpenAI.Codex_1\app\resources\codex-windows-sandbox.exe"),
            shell
        ));
        assert!(!matches_install_executable(
            Path::new(r"C:\Program Files\WindowsApps\OpenAI.Codex_1\app\resources\codex-windows-sandbox-service.exe"),
            shell
        ));
    }

    #[test]
    fn process_scope_accepts_windows_verbatim_paths_and_case_differences() {
        assert!(matches_install_executable(
            Path::new(r"\\?\C:\PROGRAM FILES\WINDOWSAPPS\OPENAI.CODEX_1\APP\CHATGPT.EXE"),
            Path::new(SHELL),
        ));
    }

    #[test]
    fn exit_wait_does_not_follow_reused_pids_or_restarted_processes() {
        let original = ObservedProcess {
            pid: 12,
            started_at: 100,
            executable: PathBuf::from(SHELL),
        };
        let mut current = ObservedProcess {
            pid: 12,
            started_at: 100,
            executable: PathBuf::from(SHELL),
        };
        assert!(same_process_instance(&original, &current));
        current.started_at = 101;
        assert!(!same_process_instance(&original, &current));
        current.started_at = 100;
        current.pid = 13;
        assert!(!same_process_instance(&original, &current));
        current.pid = 12;
        current.executable = PathBuf::from(r"C:\tools\codex.exe");
        assert!(!same_process_instance(&original, &current));
    }

    #[test]
    fn a_replacement_in_the_same_installation_cancels_launch() {
        let original = ObservedProcess {
            pid: 12,
            started_at: 100,
            executable: PathBuf::from(SHELL),
        };
        for executable in [
            SHELL,
            r"C:\Program Files\WindowsApps\OpenAI.Codex_1\app\resources\codex.exe",
        ] {
            let replacement = ObservedProcess {
                pid: 13,
                started_at: 101,
                executable: PathBuf::from(executable),
            };
            assert!(!same_process_instance(&original, &replacement));
            assert!(matches!(
                check_installation_exit(Path::new(SHELL), &[replacement]),
                Err(ProcessControlError::RestartedDuringStop),
            ));
        }
    }

    #[test]
    fn another_installation_does_not_block_stop_completion() {
        let other = ObservedProcess {
            pid: 13,
            started_at: 101,
            executable: PathBuf::from(
                r"C:\Program Files\WindowsApps\OpenAI.Codex_2\app\ChatGPT.exe",
            ),
        };
        assert!(check_installation_exit(Path::new(SHELL), &[other]).is_ok());
        assert!(check_installation_exit(Path::new(SHELL), &[]).is_ok());
    }
}
