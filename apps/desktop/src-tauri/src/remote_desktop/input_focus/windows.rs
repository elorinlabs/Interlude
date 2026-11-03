use super::FocusRect;
use std::{mem::size_of, ptr};
use windows::{
    core::BOOL,
    Win32::{
        System::{
            Com::{
                CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_INPROC_SERVER,
                COINIT_MULTITHREADED, SAFEARRAY,
            },
            Ole::{
                SafeArrayDestroy, SafeArrayGetDim, SafeArrayGetElement, SafeArrayGetLBound,
                SafeArrayGetUBound, SafeArrayGetVartype,
            },
            Variant::VT_R8,
        },
        UI::Accessibility::{
            CUIAutomation8, IUIAutomation2, IUIAutomationElement, IUIAutomationTextPattern,
            IUIAutomationTextPattern2, IUIAutomationTextRange, TextUnit_Character,
            UIA_ComboBoxControlTypeId, UIA_EditControlTypeId, UIA_TextPattern2Id,
            UIA_TextPatternId,
        },
    },
};
use windows_sys::Win32::{
    Foundation::POINT,
    Graphics::Gdi::ClientToScreen,
    UI::WindowsAndMessaging::{GetForegroundWindow, GetGUIThreadInfo, GUITHREADINFO},
};

const PROVIDER_TIMEOUT_MS: u32 = 200;

pub(super) fn read() -> Option<FocusRect> {
    let _pixels = super::super::monitors::PhysicalPixels::enter().ok()?;
    // SAFETY: Foreground window handles are observed only and never retained beyond this call.
    let foreground = unsafe { GetForegroundWindow() };
    if foreground.is_null() {
        return None;
    }
    let result = system_caret().or_else(automation_focus);
    // SAFETY: A focus change invalidates geometry collected from the previous foreground app.
    (unsafe { GetForegroundWindow() } == foreground)
        .then_some(result)
        .flatten()
}

fn system_caret() -> Option<FocusRect> {
    let mut info = GUITHREADINFO {
        cbSize: size_of::<GUITHREADINFO>() as u32,
        ..Default::default()
    };
    // SAFETY: Structures are initialized, output pointers are live, and hwndCaret is used only on success.
    unsafe {
        if GetGUIThreadInfo(0, &mut info) == 0 || info.hwndCaret.is_null() {
            return None;
        }
        let rect = info.rcCaret;
        if rect.bottom <= rect.top {
            return None;
        }
        let mut point = POINT {
            x: rect.left,
            y: rect.top,
        };
        if ClientToScreen(info.hwndCaret, &mut point) == 0 {
            return None;
        }
        Some(FocusRect {
            x: f64::from(point.x),
            y: f64::from(point.y),
            width: f64::from(rect.right - rect.left),
            height: f64::from(rect.bottom - rect.top),
            caret: true,
        })
    }
}

struct Apartment;
impl Drop for Apartment {
    fn drop(&mut self) {
        // SAFETY: Created only after successful initialization on this same blocking thread.
        unsafe {
            CoUninitialize();
        }
    }
}

fn automation_focus() -> Option<FocusRect> {
    // SAFETY: COM objects remain on this initialized worker and drop before its apartment guard.
    unsafe {
        CoInitializeEx(None, COINIT_MULTITHREADED).ok().ok()?;
        let _apartment = Apartment;
        let automation: IUIAutomation2 =
            CoCreateInstance(&CUIAutomation8, None, CLSCTX_INPROC_SERVER).ok()?;
        automation.SetConnectionTimeout(PROVIDER_TIMEOUT_MS).ok()?;
        automation.SetTransactionTimeout(PROVIDER_TIMEOUT_MS).ok()?;
        automation.SetAutoSetFocus(false).ok()?;
        let element = automation.GetFocusedElement().ok()?;
        if !element.CurrentHasKeyboardFocus().ok()?.as_bool()
            || element.CurrentIsOffscreen().ok()?.as_bool()
        {
            return None;
        }
        let result = text_range(&element)
            .and_then(range_rect)
            .or_else(|| control_rect(&element));
        let current = automation.GetFocusedElement().ok()?;
        automation
            .CompareElements(&element, &current)
            .ok()?
            .as_bool()
            .then_some(result)
            .flatten()
    }
}

fn text_range(element: &IUIAutomationElement) -> Option<IUIAutomationTextRange> {
    // SAFETY: Patterns belong to the live focused element; returned ranges are COM-owned references.
    unsafe {
        if let Ok(pattern) =
            element.GetCurrentPatternAs::<IUIAutomationTextPattern2>(UIA_TextPattern2Id)
        {
            let mut active = BOOL::default();
            if let Ok(range) = pattern.GetCaretRange(&mut active) {
                if active.as_bool() {
                    return Some(range);
                }
            }
        }
        let pattern: IUIAutomationTextPattern =
            element.GetCurrentPatternAs(UIA_TextPatternId).ok()?;
        let ranges = pattern.GetSelection().ok()?;
        if ranges.Length().ok()? != 1 {
            return None;
        }
        ranges.GetElement(0).ok()
    }
}

fn range_rect(range: IUIAutomationTextRange) -> Option<FocusRect> {
    // SAFETY: Read only geometry; expanding a local range never changes the user's selection.
    unsafe {
        let direct = range.GetBoundingRectangles().ok().and_then(array_rect);
        if direct.is_some() {
            return direct;
        }
        range.ExpandToEnclosingUnit(TextUnit_Character).ok()?;
        range.GetBoundingRectangles().ok().and_then(array_rect)
    }
}

struct Rectangles(*mut SAFEARRAY);
impl Drop for Rectangles {
    fn drop(&mut self) {
        // SAFETY: UIA transfers ownership of the array; the guard releases it exactly once.
        if let Err(error) = unsafe { SafeArrayDestroy(self.0) } {
            eprintln!("desktop input geometry cleanup failed: {error}");
        }
    }
}

fn array_rect(raw: *mut SAFEARRAY) -> Option<FocusRect> {
    if raw.is_null() {
        return None;
    }
    let array = Rectangles(raw);
    // SAFETY: Validate dimensions and double element type before copying four values into f64 slots.
    unsafe {
        if SafeArrayGetDim(array.0) != 1 || SafeArrayGetVartype(array.0).ok()? != VT_R8 {
            return None;
        }
        let start = SafeArrayGetLBound(array.0, 1).ok()?;
        if SafeArrayGetUBound(array.0, 1).ok()?.checked_sub(start)? != 3 {
            return None;
        }
        let mut values = [0.0; 4];
        for (index, value) in values.iter_mut().enumerate() {
            SafeArrayGetElement(
                array.0,
                &(start + index as i32),
                ptr::from_mut(value).cast(),
            )
            .ok()?;
        }
        (values[3] > 0.0).then_some(FocusRect {
            x: values[0],
            y: values[1],
            width: values[2],
            height: values[3],
            caret: true,
        })
    }
}

fn control_rect(element: &IUIAutomationElement) -> Option<FocusRect> {
    // SAFETY: Query only the focused control's type and rectangle; no values or text are read.
    unsafe {
        let kind = element.CurrentControlType().ok()?;
        if kind != UIA_EditControlTypeId && kind != UIA_ComboBoxControlTypeId {
            return None;
        }
        let rect = element.CurrentBoundingRectangle().ok()?;
        Some(FocusRect {
            x: f64::from(rect.left),
            y: f64::from(rect.top),
            width: f64::from(rect.right - rect.left),
            height: f64::from(rect.bottom - rect.top),
            caret: false,
        })
    }
}
