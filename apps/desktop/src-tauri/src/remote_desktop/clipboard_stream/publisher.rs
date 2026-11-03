use super::{ClipboardError, ClipboardResult, Offer, Reader};
use std::{
    collections::HashMap,
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc, Arc, Mutex, OnceLock,
    },
    time::Duration,
};
use windows::Win32::{System::Ole::*, UI::WindowsAndMessaging::*};

struct Published {
    offer: Offer,
    revision: String,
    alive: Arc<AtomicBool>,
}
static PUBLISHED: OnceLock<Mutex<HashMap<String, Published>>> = OnceLock::new();

pub(in crate::remote_desktop) fn published(scope: &str) -> Option<Offer> {
    let revision = super::super::clipboard_revision::current().ok()?;
    let state = PUBLISHED.get_or_init(Default::default).lock().ok()?;
    state
        .get(scope)
        .filter(|p| p.revision == revision && p.alive.load(Ordering::Acquire))
        .map(|p| p.offer.clone())
}

pub(in crate::remote_desktop) fn revoke(scope: &str) {
    if let Ok(mut state) = PUBLISHED.get_or_init(Default::default).lock() {
        if let Some(previous) = state.remove(scope) {
            previous.alive.store(false, Ordering::Release);
        }
    }
}

pub(in crate::remote_desktop) fn publish(
    scope: String,
    offer: Offer,
    reader: Reader,
) -> ClipboardResult<()> {
    offer.validate()?;
    let (ready, result) = mpsc::sync_channel(1);
    std::thread::Builder::new()
        .name("clipboard-file-promises".into())
        .spawn(move || {
            let alive = Arc::new(AtomicBool::new(true));
            let publication = Publication {
                scope,
                offer,
                reader,
                alive: alive.clone(),
                ready: ready.clone(),
            };
            let outcome = serve(publication);
            alive.store(false, Ordering::Release);
            if let Err(error) = outcome {
                // The receiver may already have returned after publishing succeeded.
                let _ = ready.send(Err(error));
            }
        })
        .map_err(|_| ClipboardError::Access)?;
    result
        .recv_timeout(Duration::from_secs(5))
        .map_err(|_| ClipboardError::Access)?
}

struct Publication {
    scope: String,
    offer: Offer,
    reader: Reader,
    alive: Arc<AtomicBool>,
    ready: mpsc::SyncSender<ClipboardResult<()>>,
}

fn serve(publication: Publication) -> ClipboardResult<()> {
    let _desktop =
        super::super::input_desktop::InputDesktop::enter().map_err(|_| ClipboardError::Access)?;
    // SAFETY: This dedicated STA thread owns all OLE clipboard calls and pumps COM messages until revoked.
    unsafe { OleInitialize(None) }.map_err(|_| ClipboardError::Access)?;
    let result = run(publication);
    // SAFETY: Balanced with this thread's successful OleInitialize, after its data object is released.
    unsafe { OleUninitialize() };
    result
}

fn run(publication: Publication) -> ClipboardResult<()> {
    let Publication {
        scope,
        offer,
        reader,
        alive,
        ready,
    } = publication;
    let object = super::data_object::create(offer.clone(), reader, alive.clone())?;
    // SAFETY: OLE retains the reference; object and its STA remain alive throughout clipboard ownership.
    unsafe { OleSetClipboard(&object) }.map_err(|_| ClipboardError::Access)?;
    let revision = super::super::clipboard_revision::current()?;
    let previous = PUBLISHED
        .get_or_init(Default::default)
        .lock()
        .map_err(|_| ClipboardError::Access)?
        .insert(
            scope,
            Published {
                offer,
                revision,
                alive: alive.clone(),
            },
        );
    if let Some(previous) = previous {
        previous.alive.store(false, Ordering::Release);
    }
    if ready.send(Ok(())).is_err() {
        alive.store(false, Ordering::Release);
    }
    pump(&object, &alive);
    Ok(())
}

fn pump(object: &windows::Win32::System::Com::IDataObject, alive: &AtomicBool) {
    // SAFETY: These thread-local message structures are initialized, and no caller pointers are retained.
    unsafe {
        while alive.load(Ordering::Acquire) && OleIsCurrentClipboard(object).is_ok() {
            let mut message = MSG::default();
            while PeekMessageW(&mut message, None, 0, 0, PM_REMOVE).as_bool() {
                let _ = TranslateMessage(&message);
                DispatchMessageW(&message);
            }
            std::thread::sleep(Duration::from_millis(10));
        }
        // Never clear a newer clipboard belonging to another app or session.
        if OleIsCurrentClipboard(object).is_ok() {
            if let Err(error) = OleSetClipboard(None) {
                eprintln!("clipboard promise cleanup: {error}");
            }
        }
    }
}
