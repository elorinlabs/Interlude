use super::{Offer, ReadRequest, Reader};
use std::{
    ffi::c_void,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
};
use windows::{
    core::*,
    Win32::{Foundation::*, System::Com::*},
};

#[implement(IStream)]
struct FileStream {
    offer: Offer,
    index: usize,
    reader: Reader,
    alive: Arc<AtomicBool>,
    position: Mutex<u64>,
}

pub(super) fn create(
    offer: Offer,
    index: usize,
    reader: Reader,
    alive: Arc<AtomicBool>,
) -> IStream {
    FileStream {
        offer,
        index,
        reader,
        alive,
        position: Mutex::new(0),
    }
    .into()
}

impl FileStream {
    fn read(&self, count: usize) -> Result<Vec<u8>> {
        if !self.alive.load(Ordering::Acquire) {
            return Err(STG_E_REVERTED.into());
        }
        let mut position = self.position.lock().map_err(|_| Error::from(E_FAIL))?;
        let size = self.offer.files[self.index].size;
        let length = count.min(size.saturating_sub(*position) as usize);
        let mut result = Vec::with_capacity(length.min(super::super::clipboard::CHUNK_BYTES));
        while result.len() < length {
            if !self.alive.load(Ordering::Acquire) {
                return Err(STG_E_REVERTED.into());
            }
            let wanted = (length - result.len()).min(super::super::clipboard::CHUNK_BYTES);
            let bytes = (self.reader)(ReadRequest {
                offer_id: self.offer.id.clone(),
                index: self.index,
                offset: *position,
                length: wanted,
            })
            .map_err(|_| Error::from(STG_E_READFAULT))?;
            if bytes.len() != wanted {
                return Err(STG_E_READFAULT.into());
            }
            *position += bytes.len() as u64;
            result.extend(bytes);
        }
        Ok(result)
    }
}

impl ISequentialStream_Impl for FileStream_Impl {
    fn Read(&self, buffer: *mut c_void, count: u32, read: *mut u32) -> HRESULT {
        // SAFETY: COM callers supply count writable bytes and an optional output count, valid for this call.
        unsafe {
            if !read.is_null() {
                *read = 0;
            }
        }
        if buffer.is_null() && count != 0 {
            return E_POINTER;
        }
        match self.read(count as usize) {
            Ok(bytes) => {
                // SAFETY: bytes never exceeds count. Avoid even a zero-length copy to a null pointer.
                unsafe {
                    if !bytes.is_empty() {
                        std::ptr::copy_nonoverlapping(bytes.as_ptr(), buffer.cast(), bytes.len());
                    }
                    if !read.is_null() {
                        *read = bytes.len() as u32;
                    }
                }
                if bytes.len() == count as usize {
                    S_OK
                } else {
                    S_FALSE
                }
            }
            Err(error) => error.code(),
        }
    }
    fn Write(&self, _: *const c_void, _: u32, _: *mut u32) -> HRESULT {
        STG_E_ACCESSDENIED
    }
}

impl IStream_Impl for FileStream_Impl {
    fn Seek(&self, distance: i64, origin: STREAM_SEEK, output: *mut u64) -> Result<()> {
        let mut position = self.position.lock().map_err(|_| Error::from(E_FAIL))?;
        let base = match origin {
            STREAM_SEEK_SET => 0,
            STREAM_SEEK_CUR => *position,
            STREAM_SEEK_END => self.offer.files[self.index].size,
            _ => return Err(STG_E_INVALIDFUNCTION.into()),
        };
        *position = base
            .checked_add_signed(distance)
            .ok_or_else(|| Error::from(STG_E_INVALIDFUNCTION))?;
        // SAFETY: A non-null output is a writable COM out parameter valid for this invocation.
        unsafe {
            if !output.is_null() {
                *output = *position;
            }
        }
        Ok(())
    }
    fn Stat(&self, output: *mut STATSTG, _: &STATFLAG) -> Result<()> {
        if output.is_null() {
            return Err(E_POINTER.into());
        }
        // SAFETY: Caller owns a writable STATSTG; no allocated name means STATFLAG_NONAME is supported too.
        unsafe {
            output.write(STATSTG {
                r#type: STGTY_STREAM.0 as u32,
                cbSize: self.offer.files[self.index].size,
                grfMode: STGM_READ,
                ..Default::default()
            });
        }
        Ok(())
    }
    fn Clone(&self) -> Result<IStream> {
        let position = *self.position.lock().map_err(|_| Error::from(E_FAIL))?;
        Ok(FileStream {
            offer: self.offer.clone(),
            index: self.index,
            reader: self.reader.clone(),
            alive: self.alive.clone(),
            position: Mutex::new(position),
        }
        .into())
    }
    fn CopyTo(
        &self,
        target: Ref<'_, IStream>,
        count: u64,
        read: *mut u64,
        written: *mut u64,
    ) -> Result<()> {
        let target = target.ok()?;
        let mut total = 0u64;
        // SAFETY: COM output counters are optional and writable if provided.
        unsafe {
            if !read.is_null() {
                *read = 0;
            }
            if !written.is_null() {
                *written = 0;
            }
        }
        while total < count {
            let bytes = self
                .read((count - total).min(super::super::clipboard::CHUNK_BYTES as u64) as usize)?;
            if bytes.is_empty() {
                break;
            }
            let mut output = 0;
            // SAFETY: The byte slice remains alive during Write and output is a valid count pointer.
            unsafe {
                target
                    .Write(bytes.as_ptr().cast(), bytes.len() as u32, Some(&mut output))
                    .ok()?;
            }
            if output as usize != bytes.len() {
                return Err(STG_E_WRITEFAULT.into());
            }
            total += u64::from(output);
            // SAFETY: Same valid caller-provided output pointers as above.
            unsafe {
                if !read.is_null() {
                    *read = total;
                }
                if !written.is_null() {
                    *written = total;
                }
            }
        }
        Ok(())
    }
    fn SetSize(&self, _: u64) -> Result<()> {
        Err(STG_E_ACCESSDENIED.into())
    }
    fn Commit(&self, _: &STGC) -> Result<()> {
        Ok(())
    }
    fn Revert(&self) -> Result<()> {
        Err(STG_E_INVALIDFUNCTION.into())
    }
    fn LockRegion(&self, _: u64, _: u64, _: &LOCKTYPE) -> Result<()> {
        Err(STG_E_INVALIDFUNCTION.into())
    }
    fn UnlockRegion(&self, _: u64, _: u64, _: u32) -> Result<()> {
        Err(STG_E_INVALIDFUNCTION.into())
    }
}
