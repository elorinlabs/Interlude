use super::*;
use base64::{engine::general_purpose::STANDARD, Engine};
use std::{fs, path::Path};

struct Fixture(PathBuf);
impl Fixture {
    fn new() -> Self {
        let root = std::env::temp_dir().join(format!("csw-video-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(root.join("project")).unwrap();
        let mut bytes = vec![7_u8; CHUNK_BYTES as usize * 2 + 12];
        bytes[..12].copy_from_slice(b"\0\0\0\x18ftypisom");
        fs::write(root.join("project/test.mp4"), &bytes).unwrap();
        fs::write(root.join("outside.mp4"), &bytes).unwrap();
        Self(root)
    }
    fn root(&self) -> PathBuf {
        self.0.join("project")
    }
    fn open(&self, streams: &FileStreams) -> StreamInfo {
        streams
            .insert(
                self.root(),
                StreamOpen {
                    thread_id: "thread".into(),
                    path: "test.mp4".into(),
                    max_bytes: u64::MAX,
                },
            )
            .unwrap()
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        assert!(self.0.starts_with(std::env::temp_dir()));
        fs::remove_dir_all(&self.0).unwrap();
    }
}
fn request(info: &StreamInfo, offset: u64, length: u64) -> StreamRead {
    StreamRead {
        thread_id: "thread".into(),
        id: info.id.clone(),
        offset,
        length,
        max_bytes: u64::MAX,
    }
}

#[test]
fn reads_bounded_ranges_and_seeks_without_buffering_whole_file() {
    let fixture = Fixture::new();
    let streams = FileStreams::default();
    let info = fixture.open(&streams);
    assert_eq!(info.mime_type, "video/mp4");
    for (offset, length) in [(CHUNK_BYTES, 25), (0, 12), (info.size - 4, 20)] {
        let chunk = streams.read_chunk(request(&info, offset, length)).unwrap();
        assert_eq!(chunk.offset, offset);
        let source = fs::read(fixture.root().join("test.mp4")).unwrap();
        let end = (offset + length).min(info.size) as usize;
        assert_eq!(
            STANDARD.decode(chunk.data).unwrap(),
            source[offset as usize..end]
        );
    }
    assert!(streams
        .read_chunk(request(&info, 0, CHUNK_BYTES + 1))
        .is_err());
    assert!(streams.read_chunk(request(&info, 0, 0)).is_err());
    assert!(streams.read_chunk(request(&info, info.size, 1)).is_err());
}

#[test]
fn applies_current_limit_to_open_and_each_chunk() {
    let fixture = Fixture::new();
    let streams = FileStreams::default();
    let info = fixture.open(&streams);
    assert!(matches!(
        streams.insert(
            fixture.root(),
            StreamOpen {
                thread_id: "thread".into(),
                path: "test.mp4".into(),
                max_bytes: info.size - 1,
            }
        ),
        Err(GuiError::FileTooLarge)
    ));
    let mut chunk = request(&info, 0, 12);
    chunk.max_bytes = info.size - 1;
    assert!(matches!(
        streams.read_chunk(chunk),
        Err(GuiError::FileTooLarge)
    ));
    let mut chunk = request(&info, 0, 12);
    chunk.max_bytes = info.size;
    assert!(streams.read_chunk(chunk).is_ok());
}

#[test]
fn isolates_threads_closes_and_expires_sessions() {
    let fixture = Fixture::new();
    let streams = FileStreams::default();
    let info = fixture.open(&streams);
    let mut chunk = request(&info, 0, 12);
    chunk.thread_id = "other".into();
    assert!(streams.read_chunk(chunk).is_err());
    assert!(streams
        .remove(StreamClose {
            thread_id: "other".into(),
            id: info.id.clone()
        })
        .is_err());
    streams
        .remove(StreamClose {
            thread_id: "thread".into(),
            id: info.id.clone(),
        })
        .unwrap();
    assert!(streams.read_chunk(request(&info, 0, 12)).is_err());
    let info = fixture.open(&streams);
    streams
        .sessions
        .lock()
        .unwrap()
        .get_mut(&info.id)
        .unwrap()
        .touched = Instant::now() - IDLE_TIMEOUT;
    assert!(matches!(
        streams.read_chunk(request(&info, 0, 12)),
        Err(GuiError::FileExpired)
    ));
}

#[test]
fn rejects_changed_files_and_limits_open_handles() {
    let fixture = Fixture::new();
    let streams = FileStreams::default();
    let info = fixture.open(&streams);
    fs::OpenOptions::new()
        .write(true)
        .open(fixture.root().join("test.mp4"))
        .unwrap()
        .set_len(20)
        .unwrap();
    assert!(matches!(
        streams.read_chunk(request(&info, 0, 12)),
        Err(GuiError::FileChanged)
    ));
    for _ in 1..MAX_SESSIONS {
        fixture.open(&streams);
    }
    assert!(matches!(
        streams.insert(
            fixture.root(),
            StreamOpen {
                thread_id: "thread".into(),
                path: "test.mp4".into(),
                max_bytes: u64::MAX,
            }
        ),
        Err(GuiError::FileBusy)
    ));
}

#[test]
fn rejects_device_paths_and_fake_videos() {
    let fixture = Fixture::new();
    let root = fixture.root();
    fs::write(root.join("fake.mp4"), b"this is not a video").unwrap();
    fs::write(root.join("test.txt"), b"\0\0\0\x18ftypisom").unwrap();
    for path in [
        "fake.mp4",
        "test.txt",
        ".",
        "missing.mp4",
        "//server/share.mp4",
        "test.mp4:stream",
        "file://test.mp4",
    ] {
        assert!(
            StreamFile::open(&root, path, u64::MAX, StreamKind::Video).is_err(),
            "{path}"
        );
    }
    assert!(StreamFile::open(Path::new("."), "test.mp4", u64::MAX, StreamKind::Video).is_err());
    assert!(StreamFile::open(
        &root,
        fixture.0.join("outside.mp4").to_str().unwrap(),
        u64::MAX,
        StreamKind::Video
    )
    .is_ok());
    assert!(StreamFile::open(&root, "../outside.mp4", u64::MAX, StreamKind::Video).is_ok());
}

#[test]
fn allows_large_configured_sizes_without_a_product_cap() {
    let fixture = Fixture::new();
    let streams = FileStreams::default();
    let file = fs::OpenOptions::new()
        .write(true)
        .open(fixture.root().join("test.mp4"))
        .unwrap();
    let size = 2 * 1024 * 1024 * 1024 + 1;
    file.set_len(size).unwrap();
    let info = fixture.open(&streams);
    assert_eq!(info.size, size);
    assert!(streams.read_chunk(request(&info, size - 1, 1)).is_ok());
}
