use super::{ClipboardError, ClipboardResult, Offer, Reader};
use std::{
    mem::{size_of, ManuallyDrop},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
};
use windows::{
    core::*,
    Win32::{
        Foundation::*,
        System::{
            Com::*,
            DataExchange::RegisterClipboardFormatW,
            Memory::*,
            Ole::{ReleaseStgMedium, DROPEFFECT_COPY},
        },
        UI::Shell::*,
    },
};

struct Formats {
    descriptor: u16,
    contents: u16,
    effect: u16,
}

#[implement(IDataObject, IDataObjectAsyncCapability)]
struct FileData {
    offer: Offer,
    reader: Reader,
    alive: Arc<AtomicBool>,
    formats: Formats,
    asynchronous: AtomicBool,
    operating: AtomicBool,
}

pub(super) fn create(
    offer: Offer,
    reader: Reader,
    alive: Arc<AtomicBool>,
) -> ClipboardResult<IDataObject> {
    // SAFETY: These constant UTF-16 names are null terminated and retained for the duration of the call.
    let formats = unsafe {
        Formats {
            descriptor: RegisterClipboardFormatW(w!("FileGroupDescriptorW")) as u16,
            contents: RegisterClipboardFormatW(w!("FileContents")) as u16,
            effect: RegisterClipboardFormatW(w!("Preferred DropEffect")) as u16,
        }
    };
    if formats.descriptor == 0 || formats.contents == 0 || formats.effect == 0 {
        return Err(ClipboardError::Access);
    }
    Ok(FileData {
        offer,
        reader,
        alive,
        formats,
        asynchronous: AtomicBool::new(true),
        operating: AtomicBool::new(false),
    }
    .into())
}

fn format(id: u16, medium: TYMED) -> FORMATETC {
    FORMATETC {
        cfFormat: id,
        dwAspect: DVASPECT_CONTENT.0,
        lindex: -1,
        tymed: medium.0 as u32,
        ..Default::default()
    }
}

fn global(bytes: &[u8]) -> Result<STGMEDIUM> {
    // SAFETY: Allocate movable memory owned by the returned STGMEDIUM. Shell calls ReleaseStgMedium.
    unsafe {
        let memory = GlobalAlloc(GMEM_MOVEABLE | GMEM_ZEROINIT, bytes.len())?;
        let destination = GlobalLock(memory);
        if destination.is_null() {
            if let Err(error) = GlobalFree(Some(memory)) {
                eprintln!("clipboard allocation cleanup: {error}");
            }
            return Err(E_OUTOFMEMORY.into());
        }
        std::ptr::copy_nonoverlapping(bytes.as_ptr(), destination.cast(), bytes.len());
        // GlobalUnlock returning false with no last error means the lock count reached zero.
        let _ = GlobalUnlock(memory);
        Ok(STGMEDIUM {
            tymed: TYMED_HGLOBAL.0 as u32,
            u: STGMEDIUM_0 { hGlobal: memory },
            pUnkForRelease: ManuallyDrop::new(None),
        })
    }
}

fn descriptors(offer: &Offer) -> Vec<u8> {
    let mut bytes =
        Vec::with_capacity(size_of::<u32>() + offer.files.len() * size_of::<FILEDESCRIPTORW>());
    bytes.extend_from_slice(&(offer.files.len() as u32).to_le_bytes());
    for file in &offer.files {
        let mut descriptor = FILEDESCRIPTORW {
            dwFlags: (FD_ATTRIBUTES.0 | FD_FILESIZE.0 | FD_PROGRESSUI.0 | FD_UNICODE.0) as u32,
            dwFileAttributes: windows_sys::Win32::Storage::FileSystem::FILE_ATTRIBUTE_NORMAL,
            nFileSizeHigh: (file.size >> 32) as u32,
            nFileSizeLow: file.size as u32,
            ..Default::default()
        };
        let name: Vec<_> = file.name.encode_utf16().collect();
        let mut filename = [0u16; 260];
        filename[..name.len()].copy_from_slice(&name);
        descriptor.cFileName = filename;
        // SAFETY: FILEDESCRIPTORW is packed and completely initialized; this copies its wire representation.
        bytes.extend_from_slice(unsafe {
            std::slice::from_raw_parts(
                (&descriptor as *const FILEDESCRIPTORW).cast::<u8>(),
                size_of::<FILEDESCRIPTORW>(),
            )
        });
    }
    bytes
}

impl FileData {
    fn accepts(&self, request: &FORMATETC) -> HRESULT {
        if request.dwAspect != DVASPECT_CONTENT.0 {
            return DV_E_DVASPECT;
        }
        if request.cfFormat == self.formats.contents {
            if request.lindex < 0 || request.lindex as usize >= self.offer.files.len() {
                return DV_E_LINDEX;
            }
            return if request.tymed & TYMED_ISTREAM.0 as u32 != 0 {
                S_OK
            } else {
                DV_E_TYMED
            };
        }
        if request.cfFormat != self.formats.descriptor && request.cfFormat != self.formats.effect {
            return DV_E_FORMATETC;
        }
        if request.tymed & TYMED_HGLOBAL.0 as u32 == 0 {
            return DV_E_TYMED;
        }
        S_OK
    }
}

impl IDataObject_Impl for FileData_Impl {
    fn GetData(&self, request: *const FORMATETC) -> Result<STGMEDIUM> {
        // SAFETY: COM provides a readable FORMATETC for this call; reject null pointers explicitly.
        let request = unsafe { request.as_ref() }.ok_or_else(|| Error::from(E_POINTER))?;
        self.accepts(request).ok()?;
        if request.cfFormat == self.formats.descriptor {
            return global(&descriptors(&self.offer));
        }
        if request.cfFormat == self.formats.effect {
            return global(&DROPEFFECT_COPY.0.to_le_bytes());
        }
        let stream = super::stream::create(
            self.offer.clone(),
            request.lindex as usize,
            self.reader.clone(),
            self.alive.clone(),
        );
        Ok(STGMEDIUM {
            tymed: TYMED_ISTREAM.0 as u32,
            u: STGMEDIUM_0 {
                pstm: ManuallyDrop::new(Some(stream)),
            },
            pUnkForRelease: ManuallyDrop::new(None),
        })
    }
    fn QueryGetData(&self, request: *const FORMATETC) -> HRESULT {
        // SAFETY: Only borrow the caller's FORMATETC during the invocation.
        unsafe { request.as_ref() }.map_or(E_POINTER, |request| {
            let mut query = *request;
            if query.cfFormat == self.formats.contents && query.lindex == -1 {
                query.lindex = 0;
            }
            self.accepts(&query)
        })
    }
    fn EnumFormatEtc(&self, direction: u32) -> Result<IEnumFORMATETC> {
        if direction != DATADIR_GET.0 as u32 {
            return Err(E_NOTIMPL.into());
        }
        let formats = [
            format(self.formats.descriptor, TYMED_HGLOBAL),
            format(self.formats.contents, TYMED_ISTREAM),
            format(self.formats.effect, TYMED_HGLOBAL),
        ];
        // SAFETY: Shell copies the initialized formats into its own enumerator.
        unsafe { SHCreateStdEnumFmtEtc(&formats) }
    }
    fn SetData(&self, _: *const FORMATETC, medium: *const STGMEDIUM, release: BOOL) -> Result<()> {
        // Accept Shell completion/drop-effect notifications. A remote cut must never delete source files.
        if release.as_bool() {
            if medium.is_null() {
                return Err(E_POINTER.into());
            }
            // SAFETY: fRelease transfers ownership of this STGMEDIUM to us, exactly once.
            unsafe {
                ReleaseStgMedium(medium.cast_mut());
            }
        }
        Ok(())
    }
    fn GetDataHere(&self, _: *const FORMATETC, _: *mut STGMEDIUM) -> Result<()> {
        Err(E_NOTIMPL.into())
    }
    fn GetCanonicalFormatEtc(&self, _: *const FORMATETC, output: *mut FORMATETC) -> HRESULT {
        // SAFETY: The output pointer is optional; only initialize its documented ptd field.
        unsafe {
            if !output.is_null() {
                (*output).ptd = std::ptr::null_mut();
            }
        }
        DATA_S_SAMEFORMATETC
    }
    fn DAdvise(&self, _: *const FORMATETC, _: u32, _: Ref<'_, IAdviseSink>) -> Result<u32> {
        Err(OLE_E_ADVISENOTSUPPORTED.into())
    }
    fn DUnadvise(&self, _: u32) -> Result<()> {
        Err(OLE_E_ADVISENOTSUPPORTED.into())
    }
    fn EnumDAdvise(&self) -> Result<IEnumSTATDATA> {
        Err(OLE_E_ADVISENOTSUPPORTED.into())
    }
}

impl IDataObjectAsyncCapability_Impl for FileData_Impl {
    fn SetAsyncMode(&self, value: BOOL) -> Result<()> {
        self.asynchronous.store(value.as_bool(), Ordering::Release);
        Ok(())
    }
    fn GetAsyncMode(&self) -> Result<BOOL> {
        Ok(self.asynchronous.load(Ordering::Acquire).into())
    }
    fn StartOperation(&self, _: Ref<'_, IBindCtx>) -> Result<()> {
        self.operating.store(true, Ordering::Release);
        Ok(())
    }
    fn InOperation(&self) -> Result<BOOL> {
        Ok(self.operating.load(Ordering::Acquire).into())
    }
    fn EndOperation(&self, _: HRESULT, _: Ref<'_, IBindCtx>, _: u32) -> Result<()> {
        self.operating.store(false, Ordering::Release);
        Ok(())
    }
}
