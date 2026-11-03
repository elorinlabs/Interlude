use super::*;
use crate::codex_gui::file_stream::{StreamClose, StreamOpen, StreamRead, CHUNK_BYTES};
use base64::{engine::general_purpose::STANDARD, Engine};
use std::{
    fs,
    io::{Cursor, Read},
    thread,
};

fn start(streams: &FileStreams, root: &std::path::Path) -> String {
    let response = streams
        .prepare_archive(
            root.canonicalize().unwrap(),
            StreamOpen {
                thread_id: "owner".into(),
                path: "folder".into(),
                max_bytes: u64::MAX,
            },
        )
        .unwrap();
    assert_eq!(response.data["progress"]["phase"], "scanning");
    response.data["preparationId"].as_str().unwrap().to_owned()
}

#[test]
fn prepares_then_downloads_a_valid_zip_with_exact_contents() {
    let root = tempfile::tempdir().unwrap();
    fs::create_dir_all(root.path().join("folder/empty")).unwrap();
    let expected = vec![42; 1024 * 1024];
    fs::write(root.path().join("folder/data.bin"), &expected).unwrap();
    let streams = FileStreams::downloads();
    let id = start(&streams, root.path());
    assert!(streams.poll_archive("other", &id).is_err());
    assert!(streams.archives.cancel("other", &id).is_err());
    let deadline = Instant::now() + Duration::from_secs(10);
    let info = loop {
        let reply = streams.poll_archive("owner", &id).unwrap().data;
        if reply["id"].is_string() {
            break reply;
        }
        assert!(Instant::now() < deadline);
        thread::sleep(Duration::from_millis(5));
    };
    assert_eq!(info["name"], "folder.zip");
    assert!(streams.archives.0.lock().unwrap().is_empty());
    let mut bytes = Vec::new();
    while (bytes.len() as u64) < info["size"].as_u64().unwrap() {
        let chunk = streams
            .read_chunk(StreamRead {
                thread_id: "owner".into(),
                id: info["id"].as_str().unwrap().into(),
                offset: bytes.len() as u64,
                length: CHUNK_BYTES,
                max_bytes: u64::MAX,
            })
            .unwrap();
        bytes.extend(STANDARD.decode(chunk.data).unwrap());
    }
    let mut zip = zip::ZipArchive::new(Cursor::new(bytes)).unwrap();
    assert!(zip.by_name("folder/empty/").unwrap().is_dir());
    let mut actual = Vec::new();
    zip.by_name("folder/data.bin")
        .unwrap()
        .read_to_end(&mut actual)
        .unwrap();
    assert_eq!(actual, expected);
}

#[test]
fn cancellation_releases_jobs_and_rejects_further_polls() {
    let root = tempfile::tempdir().unwrap();
    fs::create_dir(root.path().join("folder")).unwrap();
    let streams = FileStreams::downloads();
    let id = start(&streams, root.path());
    let job = Arc::clone(&streams.archives.0.lock().unwrap().get(&id).unwrap().job);
    streams
        .remove(StreamClose {
            thread_id: "owner".into(),
            id: id.clone(),
        })
        .unwrap();
    assert!(!job.update(None));
    assert!(streams.poll_archive("owner", &id).is_err());
}

#[test]
fn compression_reports_byte_progress_inside_large_files_and_honors_cancellation() {
    let root = tempfile::tempdir().unwrap();
    fs::create_dir(root.path().join("folder")).unwrap();
    fs::write(root.path().join("folder/large"), vec![42; 1024 * 1024]).unwrap();
    let mut snapshots = Vec::new();
    let result = project_entries::archive_with_progress(
        &root.path().canonicalize().unwrap(),
        "folder",
        u64::MAX,
        &mut |progress| {
            snapshots.push(progress.clone());
            progress.processed_bytes < 256 * 1024
        },
    );
    assert!(matches!(result, Err(project_entries::Error::Cancelled)));
    assert!(snapshots.iter().any(|progress| progress.processed_bytes > 0
        && progress.processed_bytes < progress.total_bytes
        && progress.completed_files == 0));
}

#[test]
fn empty_folders_complete_and_expired_jobs_stop_work() {
    let root = tempfile::tempdir().unwrap();
    fs::create_dir(root.path().join("folder")).unwrap();
    let mut last = ArchiveProgress::default();
    project_entries::archive_with_progress(
        &root.path().canonicalize().unwrap(),
        "folder",
        4096,
        &mut |progress| {
            last = progress.clone();
            true
        },
    )
    .unwrap();
    assert_eq!(last.total_bytes, 0);
    assert_eq!(last.total_files, 0);
    assert_eq!(serde_json::to_value(last).unwrap()["phase"], "finalizing");
    let job = Job {
        cancelled: AtomicBool::new(false),
        state: Mutex::new(JobState {
            touched: Instant::now() - ARCHIVE_IDLE_TIMEOUT,
            progress: ArchiveProgress::default(),
            result: None,
        }),
    };
    assert!(!job.update(None));
}
