//! Screen capture and input run on blocking workers, never the Windows UI thread.
use serde::Deserialize;
#[cfg(any(windows, target_os = "macos"))]
use sessions::begin_session;
use sessions::{close, revoke, with_lease};
use std::time::Instant;

pub(crate) mod auto_unlock;
pub(crate) mod clipboard;
mod clipboard_files;
mod clipboard_platform;
mod clipboard_revision;
pub(crate) mod clipboard_stream;
pub(crate) mod displays;
#[cfg(windows)]
pub(crate) mod input_desktop;
pub(crate) mod input_focus;
mod keyboard;
mod lease;
#[cfg(target_os = "macos")]
mod macos;
#[cfg(any(target_os = "macos", test))]
mod macos_keymap;
pub(crate) mod security;
#[cfg(windows)]
mod session_access;
mod sessions;
#[cfg(target_os = "macos")]
use macos::{input as platform_input, monitors};
#[cfg(windows)]
use windows_input as platform_input;
pub(crate) mod local_clipboard;
#[cfg(windows)]
mod monitors;
#[cfg(any(target_os = "macos", test))]
mod permission_prompt;
pub(crate) mod permissions;
#[cfg(any(windows, target_os = "macos"))]
pub(crate) mod privacy;
#[cfg(windows)]
mod privacy_setup;
#[cfg(windows)]
mod resolutions;
#[cfg(windows)]
pub(crate) mod service_worker;
pub(crate) mod stream;
pub(crate) mod system_permissions;
mod validation;
#[cfg(windows)]
mod windows;
#[cfg(windows)]
mod windows_input;

#[derive(Debug, thiserror::Error)]
pub(super) enum DesktopError {
    #[cfg(windows)]
    #[error("locked desktop requires unattended access")]
    LockedWithoutUnattended,
    #[cfg(windows)]
    #[error(transparent)]
    Unlock(#[from] auto_unlock::Error),
    #[cfg(any(windows, target_os = "macos"))]
    #[error("privacy display unavailable")]
    Privacy,
    #[cfg(any(windows, target_os = "macos"))]
    #[error("display resolution unavailable")]
    Resolution,
    #[cfg(windows)]
    #[error("privacy display requires the desktop service")]
    PrivacyService,
    #[cfg(windows)]
    #[error("privacy display installation awaiting local confirmation")]
    PrivacySetup,
    #[cfg(windows)]
    #[error("privacy display installation requires an unlocked desktop")]
    PrivacySetupLocked,
    #[cfg(any(windows, target_os = "macos"))]
    #[error("desktop session already active")]
    Busy,
    #[error("desktop permission denied")]
    Denied,
    #[error("invalid desktop request")]
    Invalid,
    #[error("desktop session expired")]
    Expired,
    #[error("desktop capture or input failed")]
    Platform,
    #[error("desktop settings unavailable")]
    Settings,
    #[cfg(any(windows, target_os = "macos"))]
    #[error("desktop display enumeration failed")]
    DisplayEnumeration,
    #[cfg(any(windows, target_os = "macos"))]
    #[error("no active desktop displays")]
    NoDisplays,
    #[cfg(any(windows, target_os = "macos"))]
    #[error("selected desktop display disconnected")]
    DisplayGone,
    #[error("desktop platform unsupported")]
    #[cfg(not(any(windows, target_os = "macos")))]
    Unsupported,
    #[cfg(target_os = "macos")]
    #[error("macOS 13 or later required")]
    MacVersion,
    #[cfg(target_os = "macos")]
    #[error("screen recording permission required")]
    ScreenPermission,
    #[cfg(target_os = "macos")]
    #[error("accessibility permission required")]
    InputPermission,
    #[cfg(target_os = "macos")]
    #[error("desktop encoder could not start")]
    EncoderStart,
    #[cfg(target_os = "macos")]
    #[error("desktop encoder produced no first frame")]
    EncoderFirstFrame,
    #[cfg(target_os = "macos")]
    #[error("desktop encoder first frame timed out")]
    EncoderTimeout,
    #[cfg(target_os = "macos")]
    #[error("desktop codec unsupported")]
    UnsupportedCodec,
}
type Result<T> = std::result::Result<T, DesktopError>;
struct Session {
    #[cfg(any(windows, target_os = "macos"))]
    privacy: Option<privacy::Guardian>,
    permissions: permissions::Permissions,
    #[cfg(any(windows, target_os = "macos"))]
    id: String,
    #[cfg(any(windows, target_os = "macos"))]
    capture_group: Option<String>,
    touched: Instant,
    deadline: Instant,
    clipboard: Option<clipboard::Transfer>,
    clipboard_revision: Option<String>,
    #[cfg(any(windows, target_os = "macos"))]
    display: monitors::Monitor,
    #[cfg(any(windows, target_os = "macos"))]
    input: platform_input::InputState,
    #[cfg(windows)]
    security: security::Guard,
}

#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
#[cfg_attr(
    not(any(windows, target_os = "macos")),
    expect(
        dead_code,
        reason = "Keep the IPC input schema on platforms without a desktop host."
    )
)]
pub(crate) enum DesktopInput {
    Move {
        x: f64,
        y: f64,
    },
    Button {
        button: Button,
        down: bool,
    },
    Wheel {
        delta: i32,
        #[serde(default)]
        horizontal: bool,
    },
    Text {
        text: String,
    },
    Key {
        key: Key,
    },
    Keyboard {
        code: keyboard::KeyboardKey,
        down: bool,
    },
}
#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum Button {
    Left,
    Right,
    Middle,
}
#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum Key {
    Enter,
    Backspace,
    Escape,
    Tab,
    Desktop,
    Windows,
}

fn safe_error(error: DesktopError) -> String {
    #[cfg(windows)]
    if let DesktopError::Unlock(error) = &error {
        return error.to_string();
    }
    match error {
        #[cfg(windows)]
        DesktopError::LockedWithoutUnattended => "client.remoteDesktop.lockedRequiresUnattended",
        #[cfg(windows)]
        DesktopError::Unlock(_) => "自动解锁未完成，请重试。",
        #[cfg(any(windows, target_os = "macos"))]
        DesktopError::Privacy => "client.remoteDesktop.privacyFailed",
        #[cfg(any(windows, target_os = "macos"))]
        DesktopError::Resolution => "分辨率未能切换，请选择其他分辨率后重试。",
        #[cfg(windows)]
        DesktopError::PrivacyService => "client.remoteDesktop.privacyRequiresUnattended",
        #[cfg(windows)]
        DesktopError::PrivacySetup => "请在电脑上确认安装，完成后再点一次隐私屏。",
        #[cfg(windows)]
        DesktopError::PrivacySetupLocked => "请先解锁电脑，再点隐私屏确认安装。",
        #[cfg(any(windows, target_os = "macos"))]
        DesktopError::Busy => "已有远程桌面连接，请先关闭后再试。",
        DesktopError::Denied => "这台电脑未允许此远程操作，请在电脑的设置中调整。",
        #[cfg(not(any(windows, target_os = "macos")))]
        DesktopError::Unsupported => "这台电脑暂不支持远程桌面，请使用 Windows 或 Mac 电脑。",
        #[cfg(target_os = "macos")]
        DesktopError::MacVersion => "远程桌面需要 macOS 13 或更新版本。",
        #[cfg(target_os = "macos")]
        DesktopError::ScreenPermission => "请在 Mac 的远程设置中开启屏幕录制权限，然后重新连接。",
        #[cfg(target_os = "macos")]
        DesktopError::InputPermission => "请在 Mac 的远程设置中开启辅助功能权限，然后重新连接。",
        DesktopError::Expired => "桌面连接已结束，请重新连接。",
        DesktopError::Invalid => "远程操作无效，请重试。",
        DesktopError::Platform => "暂时无法访问桌面，请稍后重试。",
        DesktopError::Settings => "远程桌面设置未能读取，请在电脑端重新打开远程设置。",
        #[cfg(any(windows, target_os = "macos"))]
        DesktopError::DisplayEnumeration => "未能读取显示器信息，请在电脑端重新连接显示器后重试。",
        #[cfg(any(windows, target_os = "macos"))]
        DesktopError::NoDisplays => "未找到可用显示器，请确认电脑已连接显示器并登录桌面。",
        #[cfg(any(windows, target_os = "macos"))]
        DesktopError::DisplayGone => "显示器已断开，请重新连接桌面。",
        #[cfg(target_os = "macos")]
        DesktopError::EncoderStart => "未能启动屏幕共享，请重新打开电脑端应用后重试。",
        #[cfg(target_os = "macos")]
        DesktopError::EncoderFirstFrame => "未能获取屏幕画面，请确认电脑已登录桌面后重试。",
        #[cfg(target_os = "macos")]
        DesktopError::EncoderTimeout => "获取屏幕画面超时，请重新连接。",
        #[cfg(target_os = "macos")]
        DesktopError::UnsupportedCodec => "暂时无法共享屏幕，请更新两端应用后重试。",
    }
    .into()
}

fn with_session<T>(id: &str, operation: impl FnOnce(&mut Session) -> Result<T>) -> Result<T> {
    with_lease(id, |session| {
        #[cfg(windows)]
        let _desktop = input_desktop::InputDesktop::enter()?;
        operation(session)
    })
}

fn open(
    display_id: Option<String>,
    permissions: permissions::Permissions,
    options: sessions::Options,
) -> Result<displays::Opened> {
    #[cfg(windows)]
    let _desktop = input_desktop::InputDesktop::enter()?;
    if !permissions.enabled {
        return Err(DesktopError::Denied);
    }
    if display_id
        .as_ref()
        .is_some_and(|id| id.is_empty() || id.len() > 128)
    {
        return Err(DesktopError::Invalid);
    }
    if options
        .capture_group
        .as_ref()
        .is_some_and(|group| uuid::Uuid::parse_str(group).is_err())
    {
        return Err(DesktopError::Invalid);
    }
    lease::deadline(options.expires_at)?;
    #[cfg(target_os = "macos")]
    macos::authorize_open(permissions.control)?;
    #[cfg(not(any(windows, target_os = "macos")))]
    {
        let _ = (display_id, options);
        Err(DesktopError::Unsupported)
    }
    #[cfg(any(windows, target_os = "macos"))]
    {
        let monitors = monitors::list()?;
        let display = monitors::select(&monitors, display_id.as_deref())?;
        let display_id = display.info.id.clone();
        #[cfg(windows)]
        let resolutions = if permissions.control {
            resolutions::list(&display_id)
        } else {
            vec![]
        };
        #[cfg(not(windows))]
        let resolutions = vec![];
        let id = begin_session(display, permissions, options)?;
        #[cfg(windows)]
        if let Err(error) = with_lease(&id, |session| session.security.connect(permissions)) {
            if let Err(cleanup) = close(&id) {
                eprintln!("desktop security open cleanup: {cleanup}");
            }
            return Err(error);
        }
        #[cfg(windows)]
        let security = Some(with_lease(&id, |session| session.security.snapshot())?);
        #[cfg(not(windows))]
        let security = None;
        Ok(displays::Opened {
            security,
            display_sessions: true,
            resolutions,
            platform: Some(if cfg!(target_os = "macos") {
                displays::HostPlatform::Macos
            } else {
                displays::HostPlatform::Windows
            }),
            native_only: cfg!(target_os = "macos"),
            permissions,
            id,
            display_id,
            displays: monitors.into_iter().map(|monitor| monitor.info).collect(),
        })
    }
}

#[tauri::command]
pub(crate) async fn remote_desktop_open(
    app: tauri::AppHandle,
    display_id: Option<String>,
    expires_at: Option<u64>,
    capture_group: Option<String>,
) -> std::result::Result<displays::Opened, String> {
    #[cfg(windows)]
    if let Some(opened) = crate::desktop_service::delegation::open(
        display_id.clone(),
        expires_at,
        capture_group.clone(),
    )
    .await?
    {
        return Ok(opened);
    }
    tauri::async_runtime::spawn_blocking(move || {
        permissions::open(&app, display_id, expires_at, capture_group)
    })
    .await
    .map_err(|_| safe_error(DesktopError::Platform))?
    .map_err(safe_error)
}

#[tauri::command]
pub(crate) async fn remote_desktop_renew(
    id: String,
    expires_at: u64,
) -> std::result::Result<(), String> {
    #[cfg(windows)]
    if crate::desktop_service::delegation::delegated(&id) {
        return crate::desktop_service::delegation::call(
            "remote_desktop_renew",
            &id,
            serde_json::json!({"expiresAt": expires_at}),
        )
        .await;
    }
    tauri::async_runtime::spawn_blocking(move || {
        // Renewal only updates authorization. Capture/input report desktop access failures over
        // the live control channel before it closes, so lease polling must not close it first.
        with_lease(&id, |session| {
            session.deadline = lease::deadline(Some(expires_at))?;
            Ok(())
        })
    })
    .await
    .map_err(|_| safe_error(DesktopError::Platform))?
    .map_err(safe_error)
}

#[tauri::command]
pub(crate) async fn remote_desktop_frame(
    id: String,
    width: u32,
) -> std::result::Result<tauri::ipc::Response, String> {
    tauri::async_runtime::spawn_blocking(move || {
        validation::width(width)?;
        #[cfg(windows)]
        return with_session(&id, |session| windows::capture(width, &session.display))
            .map(tauri::ipc::Response::new);
        #[cfg(target_os = "macos")]
        {
            // macOS uses ScreenCaptureKit and the native H.264 stream, never legacy JPEG capture.
            let _ = id;
            Err(DesktopError::Platform)
        }
        #[cfg(not(any(windows, target_os = "macos")))]
        {
            let _ = id;
            Err(DesktopError::Unsupported)
        }
    })
    .await
    .map_err(|_| safe_error(DesktopError::Platform))?
    .map_err(safe_error)
}

#[tauri::command]
pub(crate) async fn remote_desktop_input(
    id: String,
    input: DesktopInput,
) -> std::result::Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        validation::input(&input)?;
        with_session(&id, |session| {
            if !session.permissions.control {
                return Err(DesktopError::Denied);
            }
            #[cfg(any(windows, target_os = "macos"))]
            return session.input.apply(input, &session.display);
            #[cfg(not(any(windows, target_os = "macos")))]
            Err(DesktopError::Unsupported)
        })
    })
    .await
    .map_err(|_| safe_error(DesktopError::Platform))?
    .map_err(safe_error)
}

#[tauri::command]
pub(crate) async fn remote_desktop_close(id: String) -> std::result::Result<(), String> {
    #[cfg(windows)]
    if crate::desktop_service::delegation::delegated(&id) {
        return crate::desktop_service::delegation::call(
            "remote_desktop_close",
            &id,
            serde_json::json!({}),
        )
        .await;
    }
    tauri::async_runtime::spawn_blocking(move || close(&id))
        .await
        .map_err(|_| safe_error(DesktopError::Platform))?
        .map_err(safe_error)
}
