use super::*;
use std::sync::{
    atomic::{AtomicBool, AtomicUsize, Ordering},
    Mutex,
};
use windows::{
    core::Interface,
    Win32::{
        Foundation::*,
        System::{Com::*, DataExchange::RegisterClipboardFormatW, Ole::ReleaseStgMedium},
        UI::Shell::IDataObjectAsyncCapability,
    },
};

fn offer(size: u64) -> Offer {
    Offer {
        id: uuid::Uuid::new_v4().to_string(),
        files: vec![FileInfo {
            name: "远程文件.bin".into(),
            size,
        }],
    }
}

#[test]
fn clipboard_stream_requires_file_and_direction_permissions_for_every_request() {
    use crate::remote_desktop::permissions::Permissions;
    let publish = host::Request::Publish {
        offer: offer(1),
        paste: true,
        expected_revision: None,
    };
    let read = host::Request::Chunk {
        request: ReadRequest {
            offer_id: offer(1).id,
            index: 0,
            offset: 0,
            length: 1,
        },
    };
    for policy in [
        Permissions {
            files: false,
            ..Default::default()
        },
        Permissions {
            clipboard_write: false,
            ..Default::default()
        },
        Permissions {
            control: false,
            ..Default::default()
        },
    ] {
        assert!(host::authorize(&policy, &publish).is_err());
    }
    assert!(host::authorize(
        &Permissions {
            clipboard_read: false,
            ..Default::default()
        },
        &read
    )
    .is_err());
    assert!(host::authorize(
        &Permissions {
            files: false,
            ..Default::default()
        },
        &read
    )
    .is_err());
    assert!(host::authorize(&Permissions::default(), &read).is_ok());
}

#[test]
fn clipboard_stream_metadata_never_reads_content_and_requests_native_progress() {
    let reads = Arc::new(AtomicUsize::new(0));
    let counter = reads.clone();
    let reader: Reader = Arc::new(move |_| {
        counter.fetch_add(1, Ordering::Relaxed);
        Ok(vec![])
    });
    let object = data_object::create(offer(10), reader, Arc::new(AtomicBool::new(true))).unwrap();
    // SAFETY: All COM parameters in this test point at initialized local objects and valid buffers.
    unsafe {
        let asynchronous: IDataObjectAsyncCapability = object.cast().unwrap();
        assert!(asynchronous.GetAsyncMode().unwrap().as_bool());
        let format = FORMATETC {
            cfFormat: RegisterClipboardFormatW(windows::core::w!("FileGroupDescriptorW")) as u16,
            dwAspect: DVASPECT_CONTENT.0,
            lindex: -1,
            tymed: TYMED_HGLOBAL.0 as u32,
            ..Default::default()
        };
        let mut medium = object.GetData(&format).unwrap();
        let pointer = windows::Win32::System::Memory::GlobalLock(medium.u.hGlobal).cast::<u8>();
        assert_eq!(pointer.cast::<u32>().read_unaligned(), 1);
        let flags = pointer.add(4).cast::<u32>().read_unaligned();
        assert_ne!(flags & windows::Win32::UI::Shell::FD_PROGRESSUI.0 as u32, 0);
        let _ = windows::Win32::System::Memory::GlobalUnlock(medium.u.hGlobal);
        ReleaseStgMedium(&mut medium);
    }
    assert_eq!(reads.load(Ordering::Relaxed), 0);
}

#[test]
fn clipboard_stream_reads_only_requested_bytes_supports_seek_and_clone() {
    let requests = Arc::new(Mutex::new(Vec::new()));
    let recorded = requests.clone();
    let reader: Reader = Arc::new(move |request| {
        recorded
            .lock()
            .unwrap()
            .push((request.offset, request.length));
        Ok((request.offset..request.offset + request.length as u64)
            .map(|n| n as u8)
            .collect())
    });
    let stream = stream::create(offer(20), 0, reader, Arc::new(AtomicBool::new(true)));
    let mut bytes = [0u8; 8];
    let mut read = 0;
    // SAFETY: The stream receives valid output pointers into the local byte array and counters.
    unsafe {
        stream.Seek(5, STREAM_SEEK_SET, None).unwrap();
        let cloned = stream.Clone().unwrap();
        assert_eq!(
            stream.Read(bytes.as_mut_ptr().cast(), 8, Some(&mut read)),
            S_OK
        );
        assert_eq!(bytes, [5, 6, 7, 8, 9, 10, 11, 12]);
        assert_eq!(
            cloned.Read(bytes.as_mut_ptr().cast(), 8, Some(&mut read)),
            S_OK
        );
        stream.Seek(-2, STREAM_SEEK_END, None).unwrap();
        assert_eq!(
            stream.Read(bytes.as_mut_ptr().cast(), 8, Some(&mut read)),
            S_FALSE
        );
        assert_eq!(read, 2);
        assert_eq!(&bytes[..2], &[18, 19]);
    }
    assert_eq!(*requests.lock().unwrap(), vec![(5, 8), (5, 8), (18, 2)]);
}

#[test]
fn clipboard_stream_failed_or_revoked_reads_never_report_success() {
    let alive = Arc::new(AtomicBool::new(true));
    let stream = stream::create(offer(10), 0, Arc::new(|_| Ok(vec![1])), alive.clone());
    let mut bytes = [0u8; 8];
    let mut read = 99;
    // SAFETY: Valid output buffer and count pointers; the reader deliberately returns a short network response.
    unsafe {
        assert_eq!(
            stream.Read(bytes.as_mut_ptr().cast(), 8, Some(&mut read)),
            STG_E_READFAULT
        );
        assert_eq!(read, 0);
        alive.store(false, Ordering::Release);
        assert_eq!(
            stream.Read(bytes.as_mut_ptr().cast(), 8, Some(&mut read)),
            STG_E_REVERTED
        );
    }
}

#[test]
fn clipboard_stream_rejects_invalid_offers_and_ranges() {
    let mut valid = offer(10);
    assert!(valid.validate().is_ok());
    valid.files[0].name = "../outside".into();
    assert!(valid.validate().is_err());
    assert!(offer(MAX_BYTES as u64 + 1).validate().is_err());
    let mut request = ReadRequest {
        offer_id: valid.id,
        index: 0,
        offset: 8,
        length: 8,
    };
    assert_eq!(sources::checked_length(&request, 10).unwrap(), 2);
    request.offset = u64::MAX;
    assert!(sources::checked_length(&request, 10).is_err());
    request.offset = 0;
    request.length = super::super::clipboard::CHUNK_BYTES + 1;
    assert!(sources::checked_length(&request, 10).is_err());
}

#[test]
fn clipboard_stream_broker_cancellation_wakes_pending_reads_and_scopes_replies() {
    let scope = uuid::Uuid::new_v4().to_string();
    let (send, receive) = std::sync::mpsc::channel();
    let reader = remote_reader(
        scope.clone(),
        Arc::new(move |event| send.send(event).map_err(|_| ClipboardError::Access)),
    );
    let request = ReadRequest {
        offer_id: uuid::Uuid::new_v4().to_string(),
        index: 0,
        offset: 0,
        length: 1,
    };
    let worker = std::thread::spawn(move || reader(request));
    let event = receive
        .recv_timeout(std::time::Duration::from_secs(2))
        .unwrap();
    assert!(answer("another-session", event.request_id, Some("YQ==".into())).is_err());
    cancel(&scope);
    assert!(worker.join().unwrap().is_err());
}
