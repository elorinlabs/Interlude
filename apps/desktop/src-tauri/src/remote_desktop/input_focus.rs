//! Read focused input geometry without reading text or holding a session lock across accessibility IPC.
#[cfg(any(windows, target_os = "macos", test))]
use super::displays::Bounds;
use super::{safe_error, DesktopError};
use serde::{Deserialize, Serialize};

#[cfg(windows)]
#[path = "input_focus/windows.rs"]
mod platform;
#[cfg(target_os = "macos")]
#[path = "input_focus/macos.rs"]
mod platform;

/// Vertical display-relative coordinates shared with both mobile viewers.
#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct InputFocus {
    top: f64,
    bottom: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    line_height: Option<f64>,
}

#[cfg(any(windows, target_os = "macos", test))]
#[derive(Clone, Copy)]
struct FocusRect {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    caret: bool,
}

#[cfg(any(windows, target_os = "macos", test))]
fn normalize(rect: FocusRect, display: Bounds) -> Option<InputFocus> {
    if [rect.x, rect.y, rect.width, rect.height]
        .iter()
        .any(|value| !value.is_finite())
        || rect.width < 0.0
        || rect.height <= 0.0
        || display.height == 0
        || display.width == 0
    {
        return None;
    }
    let x = rect.x - f64::from(display.x);
    let top = rect.y - f64::from(display.y);
    let bottom = top + rect.height;
    let height = f64::from(display.height);
    if x + rect.width < 0.0 || x >= f64::from(display.width) || bottom <= 0.0 || top >= height {
        return None;
    }
    // A large text editor's outer rectangle does not identify its current input row.
    if !rect.caret && rect.height > height * 0.2 {
        return None;
    }
    Some(InputFocus {
        top: top.max(0.0) / height,
        bottom: bottom.min(height) / height,
        line_height: rect.caret.then_some(rect.height / height),
    })
}

#[cfg(any(windows, target_os = "macos"))]
fn read(id: &str) -> super::Result<Option<InputFocus>> {
    let display = super::with_session(id, |session| {
        if !session.permissions.control {
            return Err(DesktopError::Denied);
        }
        Ok(session.display.refresh()?.bounds)
    })?;
    #[cfg(windows)]
    let _desktop = super::input_desktop::InputDesktop::enter()?;
    let focus = platform::read().and_then(|rect| normalize(rect, display));
    // Closing, revocation or display replacement during a provider call invalidates its result.
    super::with_session(id, |session| {
        if !session.permissions.control {
            return Err(DesktopError::Denied);
        }
        Ok((session.display.bounds == display)
            .then_some(focus)
            .flatten())
    })
}

#[tauri::command]
pub(crate) async fn remote_desktop_input_focus(id: String) -> Result<Option<InputFocus>, String> {
    #[cfg(windows)]
    if crate::desktop_service::delegation::delegated(&id) {
        return crate::desktop_service::delegation::call(
            "remote_desktop_input_focus",
            &id,
            serde_json::json!({}),
        )
        .await;
    }
    tauri::async_runtime::spawn_blocking(move || {
        #[cfg(any(windows, target_os = "macos"))]
        return read(&id);
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

#[cfg(test)]
mod tests {
    use super::*;
    const DISPLAY: Bounds = Bounds {
        x: -1920,
        y: 200,
        width: 1920,
        height: 1080,
    };
    fn caret() -> FocusRect {
        FocusRect {
            x: -1000.0,
            y: 740.0,
            width: 2.0,
            height: 24.0,
            caret: true,
        }
    }
    #[test]
    fn uses_selected_display_coordinates_and_actual_line_height() {
        let result = normalize(caret(), DISPLAY).unwrap();
        assert_eq!(result.top, 0.5);
        assert_eq!(result.bottom, 564.0 / 1080.0);
        assert_eq!(result.line_height, Some(24.0 / 1080.0));
    }
    #[test]
    fn rejects_other_displays_invalid_rectangles_and_large_editors() {
        for rect in [
            FocusRect {
                x: 100.0,
                ..caret()
            },
            FocusRect { y: 0.0, ..caret() },
            FocusRect {
                y: f64::NAN,
                ..caret()
            },
            FocusRect {
                height: 0.0,
                ..caret()
            },
            FocusRect {
                height: 800.0,
                caret: false,
                ..caret()
            },
        ] {
            assert!(normalize(rect, DISPLAY).is_none());
        }
        assert!(normalize(
            FocusRect {
                height: 48.0,
                caret: false,
                ..caret()
            },
            DISPLAY
        )
        .is_some());
    }
    #[test]
    fn clips_partial_rows_and_accepts_zero_width_carets() {
        let result = normalize(
            FocusRect {
                y: 190.0,
                width: 0.0,
                ..caret()
            },
            DISPLAY,
        )
        .unwrap();
        assert_eq!(result.top, 0.0);
        assert_eq!(result.bottom, 14.0 / 1080.0);
    }
}
