use super::{
    account::{Account, Credentials},
    audio,
    error::Error,
    sessions::Sessions,
    transport,
};
use base64::{engine::general_purpose::STANDARD, Engine};
use reqwest::{Client, StatusCode, Url};

#[test]
fn validates_audio_container_and_size() {
    let webm = STANDARD.encode(b"\x1a\x45\xdf\xa3example");
    let result = audio::decode(&webm, "audio/webm;codecs=opus").unwrap();
    assert_eq!(result.mime, "audio/webm");
    assert_eq!(result.filename, "dictation.webm");
    assert!(audio::decode(&webm, "text/html").is_err());
    assert!(audio::decode(&webm, "audio/mp4").is_err());
    assert!(audio::decode("", "audio/webm").is_err());
    assert!(audio::decode("%%%", "audio/webm").is_err());
    assert!(audio::decode(&"A".repeat(14 * 1024 * 1024), "audio/webm").is_err());
    assert!(audio::decode(&STANDARD.encode(b"RIFF1234WAVEdata"), "audio/wav").is_ok());
    assert!(audio::decode(&STANDARD.encode(b"1234ftypM4A "), "audio/mp4").is_ok());
}

#[test]
fn exposes_only_transcription_and_safe_errors() {
    assert_eq!(
        transport::parse(br#"{"text":" hello ","asset":"private"}"#).unwrap(),
        "hello"
    );
    assert!(matches!(
        transport::parse(br#"{"text":"  "}"#),
        Err(Error::Empty)
    ));
    assert!(transport::parse(br#"{"internal":"secret"}"#).is_err());
    for (status, expected) in [
        (
            StatusCode::UNAUTHORIZED,
            "账号登录已失效，请重新登录后重试。",
        ),
        (StatusCode::FORBIDDEN, "当前账号暂时无法使用语音转写。"),
        (
            StatusCode::TOO_MANY_REQUESTS,
            "语音转写请求过于频繁，请稍后重试。",
        ),
        (StatusCode::INTERNAL_SERVER_ERROR, "转写失败，请重试。"),
    ] {
        assert_eq!(
            transport::status_error(status).unwrap_err().to_string(),
            expected
        );
    }
}

#[tokio::test]
async fn multipart_uses_managed_account_and_audio_file() {
    use std::io::{Read, Write};
    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let url = Url::parse(&format!(
        "http://{}/transcribe",
        listener.local_addr().unwrap()
    ))
    .unwrap();
    let server = std::thread::spawn(move || {
        let (mut socket, _) = listener.accept().unwrap();
        socket
            .set_read_timeout(Some(std::time::Duration::from_secs(5)))
            .unwrap();
        let mut received = Vec::new();
        let mut chunk = [0; 4096];
        loop {
            let size = socket.read(&mut chunk).unwrap();
            assert!(size > 0);
            received.extend_from_slice(&chunk[..size]);
            if received.ends_with(b"--\r\n") {
                break;
            }
        }
        socket
            .write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 14\r\n\r\n{\"text\":\"yes\"}")
            .unwrap();
        received
    });
    let audio =
        audio::decode(&STANDARD.encode(b"\x1a\x45\xdf\xa3recording"), "audio/webm").unwrap();
    let credentials = Credentials {
        token: "test-token".into(),
        account_id: "test-account".into(),
    };
    let client = Client::builder().no_proxy().build().unwrap();
    let response = transport::request(&client, url, &credentials, &audio)
        .unwrap()
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let body = server.join().unwrap();
    let body = String::from_utf8_lossy(&body);
    assert!(body.contains("authorization: Bearer test-token"));
    assert!(body.contains("chatgpt-account-id: test-account"));
    assert!(body.contains("originator: codex_desktop"));
    assert!(body.contains("name=\"file\"; filename=\"dictation.webm\""));
    assert!(body.contains("Content-Type: audio/webm") || body.contains("content-type: audio/webm"));
    assert!(!body.contains("name=\"model\""));
}

fn account() -> Account {
    Account {
        id: "selected".into(),
        revision: 7,
    }
}

#[tokio::test]
async fn session_pins_account_and_allows_only_one_request_with_retry() {
    let sessions = Sessions::default();
    let id = sessions.create(account()).await.unwrap();
    let (pinned, _cancel) = sessions.begin(&id).await.unwrap();
    assert_eq!(pinned.id, "selected");
    assert_eq!(pinned.revision, 7);
    assert!(matches!(sessions.begin(&id).await, Err(Error::Busy)));
    sessions.finish(&id, false).await;
    assert!(sessions.begin(&id).await.is_ok());
    sessions.finish(&id, true).await;
    assert!(matches!(sessions.begin(&id).await, Err(Error::Expired)));
}

#[tokio::test]
async fn cancellation_wakes_inflight_request_and_cannot_resurrect_session() {
    let sessions = Sessions::default();
    let id = sessions.create(account()).await.unwrap();
    let (_, mut cancel) = sessions.begin(&id).await.unwrap();
    sessions.cancel(&id).await;
    assert!(cancel.changed().await.is_err());
    sessions.finish(&id, false).await;
    assert!(matches!(sessions.begin(&id).await, Err(Error::Expired)));
    for _ in 0..8 {
        sessions.create(account()).await.unwrap();
    }
    assert!(matches!(sessions.create(account()).await, Err(Error::Busy)));
}
