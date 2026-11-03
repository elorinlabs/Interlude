//! Endpoint state contains no COM pointers, so a later worker can restore the original device.
use super::super::{DesktopError, Result};
use windows::{
    core::PCWSTR,
    Win32::{
        Media::Audio::{
            eConsole, eRender, Endpoints::IAudioEndpointVolume, IMMDevice, IMMDeviceEnumerator,
            MMDeviceEnumerator,
        },
        System::Com::{
            CoCreateInstance, CoInitializeEx, CoTaskMemFree, CoUninitialize, CLSCTX_ALL,
            COINIT_MULTITHREADED,
        },
    },
};

struct Apartment;
impl Apartment {
    fn enter() -> Result<Self> {
        // SAFETY: every successful initialization is balanced on this same blocking worker thread.
        unsafe { CoInitializeEx(None, COINIT_MULTITHREADED).ok() }
            .map_err(|_| DesktopError::Platform)?;
        Ok(Self)
    }
}
impl Drop for Apartment {
    fn drop(&mut self) {
        // SAFETY: Apartment never leaves the thread on which COM initialization succeeded.
        unsafe { CoUninitialize() };
    }
}

fn enumerator() -> windows::core::Result<IMMDeviceEnumerator> {
    // SAFETY: caller holds a COM apartment and requests the fixed system audio enumerator.
    unsafe { CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL) }
}

pub(super) struct MutedEndpoint {
    id: Vec<u16>,
    was_muted: bool,
}
impl MutedEndpoint {
    pub(super) fn acquire() -> Result<Self> {
        let _apartment = Apartment::enter()?;
        Self::mute_default().map_err(|_| DesktopError::Platform)
    }

    fn mute_default() -> windows::core::Result<Self> {
        // SAFETY: COM is initialized; all returned interfaces remain on this thread. GetId allocates
        // a null-terminated string with CoTaskMemAlloc, which is freed after copying it.
        unsafe {
            let device = enumerator()?.GetDefaultAudioEndpoint(eRender, eConsole)?;
            let id = device.GetId()?;
            let mut owned = id.as_wide().to_vec();
            CoTaskMemFree(Some(id.0.cast()));
            owned.push(0);
            let volume: IAudioEndpointVolume = device.Activate(CLSCTX_ALL, None)?;
            let was_muted = volume.GetMute()?.as_bool();
            volume.SetMute(true, std::ptr::null())?;
            Ok(Self {
                id: owned,
                was_muted,
            })
        }
    }

    pub(super) fn restore(&self) -> Result<()> {
        let _apartment = Apartment::enter()?;
        self.restore_endpoint().map_err(|_| DesktopError::Platform)
    }

    fn restore_endpoint(&self) -> windows::core::Result<()> {
        // SAFETY: the stored endpoint id is owned and null-terminated, and interfaces stay local.
        unsafe {
            let device: IMMDevice = enumerator()?.GetDevice(PCWSTR(self.id.as_ptr()))?;
            let volume: IAudioEndpointVolume = device.Activate(CLSCTX_ALL, None)?;
            // Respect a local user's explicit unmute during the connection.
            if volume.GetMute()?.as_bool() {
                volume.SetMute(self.was_muted, std::ptr::null())?;
            }
            Ok(())
        }
    }
}

pub(super) fn lock() -> Result<()> {
    let _desktop = super::super::input_desktop::InputDesktop::enter()?;
    // SAFETY: this parameterless call executes only for an authorized, opted-in viewer's final lease.
    if unsafe { windows_sys::Win32::System::Shutdown::LockWorkStation() } == 0 {
        return Err(DesktopError::Platform);
    }
    Ok(())
}
