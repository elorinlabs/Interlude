use super::*;
use chacha20poly1305::{
    aead::{Aead, KeyInit, Payload},
    ChaCha20Poly1305, Nonce,
};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::{TcpListener, TcpStream},
};

fn frame(kind: u8, offset: u64, bytes: &[u8]) -> Vec<u8> {
    let mut value = vec![kind];
    value.extend(offset.to_be_bytes());
    value.extend(bytes);
    value
}
fn encrypted(identity: (Uuid, Uuid, Uuid), sequence: u32, bytes: &[u8]) -> Vec<u8> {
    let mut header = b"RAB1\x01\x01\x00\x48".to_vec();
    for id in [identity.0, identity.1, identity.2] {
        header.extend(id.as_bytes());
    }
    header.extend([0; 8]);
    header.extend((bytes.len() as u32).to_be_bytes());
    header.extend(sequence.to_be_bytes());
    let cipher = ChaCha20Poly1305::new_from_slice(&[9; 32]).unwrap();
    let mut nonce = [0; 12];
    nonce[8..].copy_from_slice(&sequence.to_be_bytes());
    let data = cipher
        .encrypt(
            Nonce::from_slice(&nonce),
            Payload {
                msg: bytes,
                aad: &header,
            },
        )
        .unwrap();
    header.extend(data);
    header
}

#[test]
fn retransmission_overlaps_and_path_reframing_never_duplicate_socket_bytes() {
    let mut buffer = buffer::Buffer::default();
    buffer.receive(&frame(1, 5, b"fghij")).unwrap();
    buffer.receive(&frame(1, 3, b"defgh")).unwrap();
    buffer.receive(&frame(1, 0, b"abcde")).unwrap();
    buffer.receive(&frame(4, 10, b"")).unwrap();
    assert_eq!(buffer.take().unwrap().unwrap(), b"abcdefghij");
    assert!(!buffer.eof());
    buffer.receive(&frame(1, 2, b"cdefghi")).unwrap();
    buffer.written(10).unwrap();
    assert!(buffer.eof());
    assert!(buffer.take().unwrap().is_none());
    assert!(buffer.receive(&frame(1, 10, b"overflow")).is_err());
}

#[test]
fn window_includes_inflight_writes_and_conflicting_ends_are_rejected() {
    let mut buffer = buffer::Buffer::default();
    buffer.receive(&frame(1, 0, b"hello")).unwrap();
    assert_eq!(buffer.take().unwrap().unwrap(), b"hello");
    assert!(buffer.take().is_err());
    assert!(buffer.receive(&frame(1, WINDOW_BYTES, b"x")).is_err());
    buffer.written(5).unwrap();
    buffer.receive(&frame(1, WINDOW_BYTES, b"x")).unwrap();
    assert!(buffer.receive(&frame(4, 6, b"")).is_err());
    assert!(buffer.receive(&frame(1, MAX_POSITION, b"x")).is_err());
}

#[test]
fn authentication_precedes_replay_admission_and_epoch_reordering_is_bounded() {
    let ids = (Uuid::new_v4(), Uuid::new_v4(), Uuid::new_v4());
    let mut cipher = cipher::Cipher::new(ids.0, ids.1, &[9; 32]).unwrap();
    let valid = encrypted(ids, 5000, &frame(1, 0, b"hello"));
    let mut corrupted = valid.clone();
    *corrupted.last_mut().unwrap() ^= 1;
    assert!(cipher.decrypt(&corrupted).is_err());
    assert!(cipher.decrypt(&valid).unwrap().is_some());
    assert!(cipher.decrypt(&valid).unwrap().is_none());
    assert!(cipher
        .decrypt(&encrypted(ids, 4999, &frame(4, 5, b"")))
        .unwrap()
        .is_some());
    assert!(cipher
        .decrypt(&encrypted(ids, 900, &frame(4, 5, b"")))
        .unwrap()
        .is_none());
    let stale = encrypted((ids.0, Uuid::new_v4(), ids.2), 6000, &frame(1, 0, b"stale"));
    assert!(cipher.decrypt(&stale).unwrap().is_none());
}

#[test]
fn decrypts_an_independent_node_chacha20_poly1305_wire_vector() {
    // Generated with node:crypto, rather than the Rust encoder used by the lifecycle fixtures.
    let hex = concat!(
        "52414231010100481111111111114111811111111111111122222222222242228222222222222222",
        "3333333333334333833333333333333300000000000000000000001800000001",
        "fd3365efc06e9675ac77f1c2ed882884c476cbaee6b1b325429c9b1805ba69e12b90b1cd149b3cd1"
    );
    let bytes: Vec<u8> = (0..hex.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&hex[i..i + 2], 16).unwrap())
        .collect();
    let transfer = Uuid::parse_str("11111111-1111-4111-8111-111111111111").unwrap();
    let epoch = Uuid::parse_str("22222222-2222-4222-8222-222222222222").unwrap();
    let mut cipher = cipher::Cipher::new(transfer, epoch, &[9; 32]).unwrap();
    let (id, plain) = cipher.decrypt(&bytes).unwrap().unwrap();
    assert_eq!(id.to_string(), "33333333-3333-4333-8333-333333333333");
    assert_eq!(plain, frame(1, 0, b"native-download"));
}

#[tokio::test]
async fn blocked_socket_keeps_a_bounded_window_while_another_socket_continues() {
    let state = State::default();
    let ids = (Uuid::new_v4(), Uuid::new_v4(), Uuid::new_v4());
    state.register(ids.0, ids.1, &[9; 32]).unwrap();
    let receiver = state.receiver(&ids.0).unwrap();
    let (slow, _slow_browser) = socket_pair(&state).await;
    receiver.bind(ids.2, state.socket(slow).unwrap()).unwrap();
    let (fast, mut browser) = socket_pair(&state).await;
    let fast_ids = (ids.0, ids.1, Uuid::new_v4());
    receiver
        .bind(fast_ids.2, state.socket(fast).unwrap())
        .unwrap();
    let mut offset = 0;
    let mut sequence = 1;
    while offset < WINDOW_BYTES {
        let count = (WINDOW_BYTES - offset).min(16_000) as usize;
        assert!(state.route(&encrypted(
            ids,
            sequence,
            &frame(1, offset, &vec![42; count])
        )));
        offset += count as u64;
        sequence += 1;
    }
    state.route(&encrypted(fast_ids, sequence, &frame(1, 0, b"fast")));
    let mut bytes = [0; 4];
    tokio::time::timeout(
        std::time::Duration::from_secs(2),
        browser.read_exact(&mut bytes),
    )
    .await
    .unwrap()
    .unwrap();
    assert_eq!(&bytes, b"fast");
    state.close(&ids.0).unwrap();
    state.reap().unwrap();
    assert!(lock(&state.sockets).unwrap().is_empty());
}

async fn socket_pair(state: &State) -> (u32, TcpStream) {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let connect = TcpStream::connect(listener.local_addr().unwrap());
    let (browser, accepted) = tokio::join!(connect, listener.accept());
    (
        state.attach(accepted.unwrap().0.into_split()).unwrap(),
        browser.unwrap(),
    )
}

#[tokio::test]
async fn authenticated_download_bypasses_frontend_and_replenishes_credit_after_socket_write() {
    let state = State::default();
    let ids = (Uuid::new_v4(), Uuid::new_v4(), Uuid::new_v4());
    state.register(ids.0, ids.1, &[9; 32]).unwrap();
    let (socket, mut browser) = socket_pair(&state).await;
    let receiver = state.receiver(&ids.0).unwrap();
    receiver.bind(ids.2, state.socket(socket).unwrap()).unwrap();
    browser.write_all(b"request").await.unwrap();
    assert_eq!(&state.read(socket).await.unwrap()[1..], b"request");
    let data = frame(1, 0, b"response");
    assert!(state.route(&encrypted(ids, 1, &data)));
    assert!(state.route(&encrypted(ids, 2, &data)));
    assert!(state.route(&encrypted(ids, 3, &frame(4, 8, b""))));
    let mut bytes = Vec::new();
    tokio::time::timeout(
        std::time::Duration::from_secs(2),
        browser.read_to_end(&mut bytes),
    )
    .await
    .unwrap()
    .unwrap();
    assert_eq!(bytes, b"response");
    let poll = serde_json::to_value(receiver.poll().await.unwrap()).unwrap();
    assert!(poll["records"].as_array().unwrap().is_empty());
    assert_eq!(poll["progress"][0]["consumed"], 8);
    assert_eq!(poll["progress"][0]["eof"], true);
    state.close(&ids.0).unwrap();
    assert!(state.read(socket).await.is_err());
}

#[tokio::test]
async fn receiver_close_cancels_reads_and_unknown_transfers_still_reach_file_receivers() {
    let state = Arc::new(State::default());
    let ids = (Uuid::new_v4(), Uuid::new_v4(), Uuid::new_v4());
    assert!(!state.route(&encrypted(ids, 1, &frame(1, 0, b"file"))));
    state.register(ids.0, ids.1, &[9; 32]).unwrap();
    let (socket, _browser) = socket_pair(&state).await;
    state
        .receiver(&ids.0)
        .unwrap()
        .bind(ids.2, state.socket(socket).unwrap())
        .unwrap();
    let cloned = state.clone();
    let read = tokio::spawn(async move { cloned.read(socket).await });
    tokio::task::yield_now().await;
    state.close(&ids.0).unwrap();
    assert!(read.await.unwrap().is_err());
    state.reap().unwrap();
    assert!(lock(&state.sockets).unwrap().is_empty());
}

#[tokio::test]
async fn late_bytes_after_unbind_cannot_overflow_control_or_close_other_streams() {
    let state = State::default();
    let ids = (Uuid::new_v4(), Uuid::new_v4(), Uuid::new_v4());
    state.register(ids.0, ids.1, &[9; 32]).unwrap();
    let receiver = state.receiver(&ids.0).unwrap();
    receiver.unbind(&ids.2).unwrap();
    for sequence in 1..=300 {
        assert!(state.route(&encrypted(ids, sequence, &frame(1, 0, b"late bytes"))));
    }
    let active = (ids.0, ids.1, Uuid::new_v4());
    state.route(&encrypted(active, 301, &[5]));
    let poll = serde_json::to_value(receiver.poll().await.unwrap()).unwrap();
    assert_eq!(poll["records"].as_array().unwrap().len(), 1);
    assert_eq!(poll["records"][0]["requestId"], active.2.to_string());
    state.close(&ids.0).unwrap();
}

#[tokio::test]
async fn invalid_socket_offsets_do_not_close_other_sockets_or_overwrite_failed_progress() {
    let state = State::default();
    let ids = (Uuid::new_v4(), Uuid::new_v4(), Uuid::new_v4());
    state.register(ids.0, ids.1, &[9; 32]).unwrap();
    let receiver = state.receiver(&ids.0).unwrap();
    let (slow, _slow_browser) = socket_pair(&state).await;
    receiver.bind(ids.2, state.socket(slow).unwrap()).unwrap();
    state.route(&encrypted(ids, 1, &frame(1, WINDOW_BYTES, b"invalid")));
    // These already-in-flight frames are discarded after the socket fails.
    for sequence in 2..=300 {
        state.route(&encrypted(ids, sequence, &frame(1, 0, b"late")));
    }
    let fast_ids = (ids.0, ids.1, Uuid::new_v4());
    let (fast, mut browser) = socket_pair(&state).await;
    receiver
        .bind(fast_ids.2, state.socket(fast).unwrap())
        .unwrap();
    state.route(&encrypted(fast_ids, 301, &frame(1, 0, b"healthy")));
    let mut bytes = [0; 7];
    tokio::time::timeout(
        std::time::Duration::from_secs(2),
        browser.read_exact(&mut bytes),
    )
    .await
    .unwrap()
    .unwrap();
    assert_eq!(&bytes, b"healthy");
    let poll = serde_json::to_value(receiver.poll().await.unwrap()).unwrap();
    let failed = poll["progress"]
        .as_array()
        .unwrap()
        .iter()
        .find(|value| value["requestId"] == ids.2.to_string())
        .unwrap();
    assert_eq!(failed["failed"], true);
    assert!(poll["records"].as_array().unwrap().is_empty());
    state.close(&ids.0).unwrap();
}
