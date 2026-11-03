use std::path::PathBuf;

use windows::{
    core::PWSTR,
    Win32::{
        Foundation::{CloseHandle, FILETIME, HANDLE, LPARAM, RPC_E_CHANGED_MODE, WPARAM},
        System::Threading::{
            GetProcessTimes, OpenProcess, QueryFullProcessImageNameW, TerminateProcess,
            PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION, PROCESS_TERMINATE,
        },
        UI::WindowsAndMessaging::{EnumWindows, GetWindow, GetWindowThreadProcessId, IsWindowVisible, PostMessageW, ShowWindow, SetForegroundWindow, GW_OWNER, SW_RESTORE, WM_CLOSE},
    },
};

use super::{same_process_instance, ObservedProcess};

const MAX_WINDOWS_PATH_UNITS: usize = 32_768;
const FILETIME_UNITS_PER_SECOND: u64 = 10_000_000;
const WINDOWS_TO_UNIX_EPOCH_SECONDS: u64 = 11_644_473_600;
const TERMINATION_EXIT_CODE: u32 = 1;

/// Activate through Windows so package/runtime errors are returned to the caller.
pub(super) fn activate_desktop() -> windows::core::Result<u32> {
    use windows::Win32::System::Com::{CoInitializeEx, CoUninitialize, CoCreateInstance, COINIT_APARTMENTTHREADED, CLSCTX_LOCAL_SERVER};
    use windows::Win32::UI::Shell::{ApplicationActivationManager, IApplicationActivationManager, AO_NONE};
    struct Apartment(bool);
    impl Drop for Apartment {
        fn drop(&mut self) {
            if self.0 {
                // SAFETY: balances initialization on this same worker thread.
                unsafe { CoUninitialize() };
            }
        }
    }
    // Tauri may have initialized this worker as MTA. COM can still be used,
    // but only an initialization performed here may be balanced on drop.
    let initialized_here = match unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED) }.ok() {
        Ok(()) => true,
        Err(error) if error.code() == RPC_E_CHANGED_MODE => false,
        Err(error) => return Err(error),
    };
    let _apartment = Apartment(initialized_here);
    // SAFETY: system COM class, no aggregation; literals remain alive throughout activation.
    let app_user_model_id = crate::dream_skin_native::detect_chatgpt_app_user_model_id()
        .ok_or_else(|| windows::core::Error::new(
            windows::core::HRESULT(0x80070002u32 as i32),
            "当前未找到可激活的 Codex 安装",
        ))?;
    unsafe {
        let manager: IApplicationActivationManager = CoCreateInstance(&ApplicationActivationManager, None, CLSCTX_LOCAL_SERVER)?;
        manager.ActivateApplication(&windows::core::HSTRING::from(app_user_model_id), windows::core::w!(""), AO_NONE)
    }
}

struct ProcessHandle(HANDLE);

impl Drop for ProcessHandle {
    fn drop(&mut self) {
        // SAFETY: this guard owns the successful OpenProcess handle exclusively.
        // Closing cannot be retried after ownership ends; the OS handles cleanup.
        let _ = unsafe { CloseHandle(self.0) };
    }
}

impl ProcessHandle {
    fn open(pid: u32) -> Option<Self> {
        // SAFETY: the PID is an observed integer and no handle is inherited.
        let handle = unsafe {
            OpenProcess(
                PROCESS_QUERY_LIMITED_INFORMATION | PROCESS_TERMINATE,
                false,
                pid,
            )
        }
        .ok()?;
        Some(Self(handle))
    }

    fn executable(&self) -> Option<PathBuf> {
        let mut buffer = vec![0u16; MAX_WINDOWS_PATH_UNITS];
        let mut length = buffer.len() as u32;
        // SAFETY: buffer is writable for length UTF-16 units and the handle is live.
        unsafe {
            QueryFullProcessImageNameW(
                self.0,
                PROCESS_NAME_WIN32,
                PWSTR(buffer.as_mut_ptr()),
                &mut length,
            )
        }
        .ok()?;
        Some(PathBuf::from(
            String::from_utf16(&buffer[..length as usize]).ok()?,
        ))
    }

    fn started_at(&self) -> Option<u64> {
        let (mut creation, mut exit, mut kernel, mut user) = (
            FILETIME::default(),
            FILETIME::default(),
            FILETIME::default(),
            FILETIME::default(),
        );
        // SAFETY: all four output pointers are distinct live FILETIME values.
        unsafe { GetProcessTimes(self.0, &mut creation, &mut exit, &mut kernel, &mut user) }
            .ok()?;
        let timestamp = ((creation.dwHighDateTime as u64) << 32) | creation.dwLowDateTime as u64;
        (timestamp / FILETIME_UNITS_PER_SECOND).checked_sub(WINDOWS_TO_UNIX_EPOCH_SECONDS)
    }
}

/// The same handle is used to verify identity and terminate, avoiding PID reuse races.
pub(super) fn terminate_observed_process(expected: &ObservedProcess) -> bool {
    let Some(handle) = ProcessHandle::open(expected.pid) else {
        return false;
    };
    let (Some(executable), Some(started_at)) = (handle.executable(), handle.started_at()) else {
        return false;
    };
    let current = ObservedProcess {
        pid: expected.pid,
        started_at,
        executable,
    };
    if !same_process_instance(expected, &current) {
        return false;
    }
    // SAFETY: this owned handle still refers to the process whose path and creation
    // time were verified above, even if its numeric PID is subsequently reused.
    unsafe { TerminateProcess(handle.0, TERMINATION_EXIT_CODE) }.is_ok()
}

/// Ask the official desktop window to shut down before terminating helpers.
pub(super) fn request_close_process_window(pid: u32) -> bool {
    extern "system" fn visit(hwnd: windows::Win32::Foundation::HWND, data: windows::Win32::Foundation::LPARAM) -> windows::core::BOOL {
        let state = unsafe { &mut *(data.0 as *mut (u32, bool)) };
        let mut owner_pid = 0u32;
        unsafe { GetWindowThreadProcessId(hwnd, Some(&mut owner_pid)); }
        if owner_pid != state.0 || !unsafe { IsWindowVisible(hwnd).as_bool() }
            || unsafe { GetWindow(hwnd, GW_OWNER).map(|owner| !owner.0.is_null()).unwrap_or(false) }
        {
            return true.into();
        }
        state.1 = unsafe { PostMessageW(Some(hwnd), WM_CLOSE, WPARAM(0), LPARAM(0)) }.is_ok();
        false.into()
    }
    let mut state = (pid, false);
    let _ = unsafe { EnumWindows(Some(visit), windows::Win32::Foundation::LPARAM(&mut state as *mut _ as isize)) };
    state.1
}

/// Restores the first visible top-level window owned by a process.
pub(super) fn bring_process_window_to_front(pid: u32) -> bool {
    extern "system" fn visit(hwnd: windows::Win32::Foundation::HWND, data: windows::Win32::Foundation::LPARAM) -> windows::core::BOOL {
        // SAFETY: EnumWindows invokes this callback synchronously with our live state.
        let state = unsafe { &mut *(data.0 as *mut (u32, bool)) };
        let mut owner_pid = 0u32;
        unsafe { GetWindowThreadProcessId(hwnd, Some(&mut owner_pid)); }
        if owner_pid != state.0 || !unsafe { IsWindowVisible(hwnd).as_bool() } || unsafe { GetWindow(hwnd, GW_OWNER).map(|w| !w.0.is_null()).unwrap_or(false) } { return true.into(); }
        unsafe { let _ = ShowWindow(hwnd, SW_RESTORE); let _ = SetForegroundWindow(hwnd); }
        state.1 = true;
        false.into()
    }
    let mut state = (pid, false);
    // SAFETY: state outlives the synchronous enumeration; the callback does not retain it.
    let _ = unsafe { EnumWindows(Some(visit), windows::Win32::Foundation::LPARAM(&mut state as *mut _ as isize)) };
    state.1
}

#[cfg(test)]
mod tests {
    use super::*;


    #[test]
    fn snapshot_start_time_matches_native_query_for_current_process() {
        let pid = std::process::id();
        let system = super::super::process_snapshot();
        let observed = system
            .process(sysinfo::Pid::from_u32(pid))
            .expect("the test process should be present in its own snapshot");
        assert!(observed.start_time() > 0);
        // SAFETY: the test requests only query access to its own live process.
        // It never obtains termination rights or calls a termination function.
        let handle = ProcessHandle(unsafe {
            OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid)
                .expect("the test process should allow read-only process queries")
        });
        assert_eq!(handle.started_at(), Some(observed.start_time()));
    }
}
