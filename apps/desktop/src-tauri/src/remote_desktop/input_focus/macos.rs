use super::FocusRect;
use core_foundation::{base::TCFType, string::CFString};
use std::{ffi::c_void, ptr};

type Ref = *const c_void;
const AX_POINT: u32 = 1;
const AX_SIZE: u32 = 2;
const AX_RECT: u32 = 3;
const PROVIDER_TIMEOUT_SECONDS: f32 = 0.2;

#[repr(C)]
#[derive(Default)]
struct Point {
    x: f64,
    y: f64,
}
#[repr(C)]
#[derive(Default)]
struct Size {
    width: f64,
    height: f64,
}
#[repr(C)]
#[derive(Default)]
struct Rect {
    origin: Point,
    size: Size,
}

#[link(name = "ApplicationServices", kind = "framework")]
extern "C" {
    fn AXIsProcessTrusted() -> bool;
    fn AXUIElementCreateSystemWide() -> Ref;
    fn AXUIElementGetTypeID() -> usize;
    fn AXUIElementCopyAttributeValue(element: Ref, name: Ref, value: *mut Ref) -> i32;
    fn AXUIElementCopyParameterizedAttributeValue(
        element: Ref,
        name: Ref,
        parameter: Ref,
        value: *mut Ref,
    ) -> i32;
    fn AXUIElementSetMessagingTimeout(element: Ref, seconds: f32) -> i32;
    fn AXValueGetTypeID() -> usize;
    fn AXValueGetType(value: Ref) -> u32;
    fn AXValueGetValue(value: Ref, kind: u32, output: *mut c_void) -> bool;
}
#[link(name = "CoreFoundation", kind = "framework")]
extern "C" {
    fn CFRelease(value: Ref);
    fn CFGetTypeID(value: Ref) -> usize;
    fn CFEqual(left: Ref, right: Ref) -> bool;
}

struct Object(Ref);
impl Drop for Object {
    fn drop(&mut self) {
        // SAFETY: Every Object wraps a non-null Create/Copy reference and releases it once.
        unsafe {
            CFRelease(self.0);
        }
    }
}
impl Object {
    fn attribute(&self, name: &str) -> Option<Self> {
        let key = CFString::new(name);
        let mut result = ptr::null();
        // SAFETY: Element, key and output pointer remain live throughout the Copy operation.
        let status =
            unsafe { AXUIElementCopyAttributeValue(self.0, key.as_CFTypeRef(), &mut result) };
        if status == 0 && !result.is_null() {
            Some(Self(result))
        } else {
            None
        }
    }
    fn parameter(&self, name: &str, parameter: &Self) -> Option<Self> {
        let key = CFString::new(name);
        let mut result = ptr::null();
        // SAFETY: All borrowed references are live and successful Copy returns one owned reference.
        let status = unsafe {
            AXUIElementCopyParameterizedAttributeValue(
                self.0,
                key.as_CFTypeRef(),
                parameter.0,
                &mut result,
            )
        };
        if status == 0 && !result.is_null() {
            Some(Self(result))
        } else {
            None
        }
    }
    fn geometry<T: Default>(&self, kind: u32) -> Option<T> {
        let mut result = T::default();
        // SAFETY: Callers pair the C-layout Point/Size/Rect with their matching AX value type.
        // Both the CF runtime type and AX subtype are checked before copying into that layout.
        unsafe {
            if CFGetTypeID(self.0) != AXValueGetTypeID() || AXValueGetType(self.0) != kind {
                return None;
            }
            AXValueGetValue(self.0, kind, ptr::from_mut(&mut result).cast()).then_some(result)
        }
    }
}

pub(super) fn read() -> Option<FocusRect> {
    // SAFETY: This read does not request authorization or activate another application.
    if !unsafe { AXIsProcessTrusted() } {
        return None;
    }
    // SAFETY: The Create result is retained by the local guard and checked before use.
    let raw = unsafe { AXUIElementCreateSystemWide() };
    if raw.is_null() {
        return None;
    }
    let system = Object(raw);
    let element = system.attribute("AXFocusedUIElement")?;
    // SAFETY: Verify the element type before using element-only APIs; bound cross-process requests.
    unsafe {
        if CFGetTypeID(element.0) != AXUIElementGetTypeID()
            || AXUIElementSetMessagingTimeout(element.0, PROVIDER_TIMEOUT_SECONDS) != 0
        {
            return None;
        }
    }
    let result = caret_rect(&element).or_else(|| control_rect(&element));
    let current = system.attribute("AXFocusedUIElement")?;
    // SAFETY: Both CF references are live; discard results if focus moved during the query.
    unsafe { CFEqual(element.0, current.0) }
        .then_some(result)
        .flatten()
}

fn caret_rect(element: &Object) -> Option<FocusRect> {
    let range = element.attribute("AXSelectedTextRange")?;
    let rect: Rect = element
        .parameter("AXBoundsForRange", &range)?
        .geometry(AX_RECT)?;
    (rect.size.height > 0.0).then_some(FocusRect {
        x: rect.origin.x,
        y: rect.origin.y,
        width: rect.size.width,
        height: rect.size.height,
        caret: true,
    })
}

fn control_rect(element: &Object) -> Option<FocusRect> {
    let role = element.attribute("AXRole")?;
    let supported = ["AXTextField", "AXTextArea", "AXComboBox"]
        .iter()
        .any(|name| {
            let expected = CFString::new(name);
            // SAFETY: CFEqual supports arbitrary CF types and both arguments remain live.
            unsafe { CFEqual(role.0, expected.as_CFTypeRef()) }
        });
    if !supported {
        return None;
    }
    let position: Point = element.attribute("AXPosition")?.geometry(AX_POINT)?;
    let size: Size = element.attribute("AXSize")?.geometry(AX_SIZE)?;
    Some(FocusRect {
        x: position.x,
        y: position.y,
        width: size.width,
        height: size.height,
        caret: false,
    })
}
