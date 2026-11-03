use super::{Error, Result};
use std::{
    path::Path,
    process::{Child, Command},
};

pub(super) fn package_target() -> Result<String> {
    let platform = match std::env::consts::OS {
        "windows" => "windows",
        "macos" => "macos",
        "linux" => "linux",
        _ => return Err(Error::Unsupported),
    };
    let arch = std::env::consts::ARCH;
    if !matches!(arch, "x86_64" | "aarch64") || (platform == "linux" && arch != "x86_64") {
        return Err(Error::Unsupported);
    }
    Ok(format!("{platform}-{arch}"))
}

pub(super) fn executable() -> &'static str {
    if cfg!(windows) {
        "remoteai-coze.exe"
    } else {
        "remoteai-coze"
    }
}

pub(super) fn python_worker() -> &'static str {
    if cfg!(windows) {
        "remoteai-coze-python.exe"
    } else {
        "remoteai-coze-python"
    }
}

pub(super) fn spawn(command: &mut Command) -> Result<Child> {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    command.spawn().map_err(|_| Error::Startup)
}

pub(super) fn make_executable(path: &Path) -> Result<()> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o700))
            .map_err(|_| Error::Storage)?;
    }
    #[cfg(not(unix))]
    let _ = path;
    Ok(())
}

pub(super) fn private_directory(path: &Path) -> Result<()> {
    std::fs::create_dir_all(path).map_err(|_| Error::Storage)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o700))
            .map_err(|_| Error::Storage)?;
    }
    Ok(())
}
