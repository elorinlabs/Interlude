//! Build each terminal's environment from the current Windows settings, without changing the app's.
use portable_pty::CommandBuilder;
use std::{
    collections::HashSet,
    ffi::{c_void, OsStr, OsString},
    io,
    os::windows::{
        ffi::OsStringExt,
        io::{AsRawHandle, FromRawHandle, OwnedHandle},
    },
    ptr,
};
use windows_sys::Win32::{
    Security::{TOKEN_DUPLICATE, TOKEN_QUERY},
    System::{
        Environment::{CreateEnvironmentBlock, DestroyEnvironmentBlock},
        Threading::{GetCurrentProcess, OpenProcessToken},
    },
};

pub(super) fn refresh(command: &mut CommandBuilder) {
    let current = match EnvironmentBlock::current() {
        Ok(block) => block.variables(),
        Err(error) => {
            // Opening a terminal should still work if Windows cannot refresh its environment.
            eprintln!("terminal environment refresh failed: {error}");
            return;
        }
    };
    apply(command, std::env::vars_os(), current);
}

fn apply(
    command: &mut CommandBuilder,
    inherited: impl IntoIterator<Item = (OsString, OsString)>,
    current: impl IntoIterator<Item = (OsString, OsString)>,
) {
    // portable-pty expands registry values against the old app environment. Rebuild from the
    // OS snapshot instead so a newly installed nvm's PATH uses its current NVM_HOME/NVM_SYMLINK.
    command.env_clear();
    for (name, value) in inherited {
        command.env(name, value);
    }
    for (name, value) in current {
        if name.eq_ignore_ascii_case("PATH") {
            let path = merge_path(&value, command.get_env("PATH"));
            command.env(name, path);
        } else {
            command.env(name, value);
        }
    }
}

fn merge_path(current: &OsStr, inherited: Option<&OsStr>) -> OsString {
    let mut seen = HashSet::new();
    let mut merged = Vec::new();
    // Current settings take priority; retain extra directories supplied by the app's launcher.
    for path in [Some(current), inherited].into_iter().flatten() {
        for entry in std::env::split_paths(path).filter(|entry| !entry.as_os_str().is_empty()) {
            if !seen.insert(entry.as_os_str().to_ascii_lowercase()) {
                continue;
            }
            merged.push(entry);
        }
    }
    std::env::join_paths(merged).unwrap_or_else(|error| {
        eprintln!("terminal inherited PATH merge failed: {error}");
        current.to_owned()
    })
}

struct EnvironmentBlock(*mut c_void);

impl EnvironmentBlock {
    fn current() -> io::Result<Self> {
        let mut token = ptr::null_mut();
        // SAFETY: GetCurrentProcess returns a valid pseudo-handle; token is a writable out pointer.
        if unsafe {
            OpenProcessToken(
                GetCurrentProcess(),
                TOKEN_QUERY | TOKEN_DUPLICATE,
                &mut token,
            )
        } == 0
        {
            return Err(io::Error::last_os_error());
        }
        // SAFETY: A successful OpenProcessToken returns a new handle owned by this scope.
        let token = unsafe { OwnedHandle::from_raw_handle(token) };
        let mut block = ptr::null_mut();
        // SAFETY: token remains alive and has the required rights; block is a writable out pointer.
        // Do not inherit here: Windows must expand registry references using fresh variable values.
        if unsafe { CreateEnvironmentBlock(&mut block, token.as_raw_handle(), 0) } == 0 {
            return Err(io::Error::last_os_error());
        }
        Ok(Self(block))
    }

    fn variables(&self) -> Vec<(OsString, OsString)> {
        let mut variables = Vec::new();
        let mut start = self.0.cast::<u16>();
        // SAFETY: CreateEnvironmentBlock owns a double-NUL-terminated UTF-16 block until Drop.
        // Each scan stops at its entry's NUL; the outer scan stops at the final empty entry.
        unsafe {
            while *start != 0 {
                let mut length = 0;
                while *start.add(length) != 0 {
                    length += 1;
                }
                if let Some(variable) = parse_entry(std::slice::from_raw_parts(start, length)) {
                    variables.push(variable);
                }
                start = start.add(length + 1);
            }
        }
        variables
    }
}

impl Drop for EnvironmentBlock {
    fn drop(&mut self) {
        // SAFETY: The pointer is owned by this object, came from CreateEnvironmentBlock, and is
        // freed exactly once after all borrowed entry slices have gone out of scope.
        if unsafe { DestroyEnvironmentBlock(self.0) } == 0 {
            eprintln!(
                "terminal environment cleanup failed: {}",
                io::Error::last_os_error()
            );
        }
    }
}

fn parse_entry(entry: &[u16]) -> Option<(OsString, OsString)> {
    let separator = entry.iter().position(|unit| *unit == u16::from(b'='))?;
    // Hidden drive-current-directory entries (=C:=...) are not ordinary environment variables.
    if separator == 0 {
        return None;
    }
    Some((
        OsString::from_wide(&entry[..separator]),
        OsString::from_wide(&entry[separator + 1..]),
    ))
}

#[cfg(test)]
mod tests;
