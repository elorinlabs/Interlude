use super::*;
use base64::{engine::general_purpose::STANDARD, Engine};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::{TcpListener, TcpStream},
};

#[test]
fn targets_keep_the_remote_host_and_reject_non_web_links() {
    for (url, expected) in [
        (
            "http://localhost:3002/path?q=yes#section",
            ("localhost", 3002),
        ),
        ("http://192.168.10.15:3002/", ("192.168.10.15", 3002)),
        ("http://0.0.0.0:5173/", ("127.0.0.1", 5173)),
        ("http://[::]:5173/", ("::1", 5173)),
        ("https://example.com/", ("example.com", 443)),
    ] {
        assert_eq!(destination(url).unwrap(), (expected.0.into(), expected.1));
    }
    for invalid in [
        "file:///C:/secret",
        "javascript:alert(1)",
        "ssh://localhost",
        "http://user:pass@localhost/",
    ] {
        assert!(destination(invalid).is_err());
    }
}

async fn listener(state: &Arc<LinkState>) -> (String, u16) {
    let LinkReply::Listener { id, port } = state
        .perform(LinkRequest::Listen { port: None })
        .await
        .unwrap()
    else {
        panic!("listener reply expected");
    };
    (id, port)
}

#[test]
fn listener_ports_validate_at_the_ipc_boundary_and_keep_automatic_ports_compatible() {
    let automatic = serde_json::from_str::<LinkRequest>(r#"{"type":"listen"}"#).unwrap();
    assert!(matches!(automatic, LinkRequest::Listen { port: None }));
    for port in ["-1", "65536", "1.5", "\"3000\""] {
        let request = format!(r#"{{"type":"listen","port":{port}}}"#);
        assert!(serde_json::from_str::<LinkRequest>(&request).is_err());
    }
}

#[tokio::test]
async fn fixed_ports_reject_conflicts_and_can_be_reused_after_stop() {
    let state = Arc::new(LinkState::default());
    let reserved = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = reserved.local_addr().unwrap().port();
    assert!(matches!(
        state
            .perform(LinkRequest::Listen { port: Some(port) })
            .await,
        Err(LinkError::PortInUse)
    ));
    assert!(matches!(
        state.perform(LinkRequest::Listen { port: Some(0) }).await,
        Err(LinkError::Invalid)
    ));
    drop(reserved);
    for _ in 0..2 {
        let LinkReply::Listener { id, port: actual } = state
            .perform(LinkRequest::Listen { port: Some(port) })
            .await
            .unwrap()
        else {
            panic!("listener expected")
        };
        assert_eq!(actual, port);
        state
            .perform(LinkRequest::Stop { scope: id })
            .await
            .unwrap();
    }
}

#[tokio::test]
async fn stopping_one_mapping_keeps_other_local_ports_listening() {
    let state = Arc::new(LinkState::default());
    let (first, first_port) = listener(&state).await;
    let (second, second_port) = listener(&state).await;
    assert_ne!(first_port, second_port);
    state
        .perform(LinkRequest::Stop { scope: first })
        .await
        .unwrap();
    assert!(TcpStream::connect(("127.0.0.1", first_port)).await.is_err());
    assert!(TcpStream::connect(("127.0.0.1", second_port)).await.is_ok());
    state
        .perform(LinkRequest::Stop { scope: second })
        .await
        .unwrap();
}

#[tokio::test]
async fn stopped_port_is_reusable_while_a_previous_accept_is_in_flight() {
    let state = Arc::new(LinkState::default());
    let (scope, port) = listener(&state).await;
    let accepting_state = state.clone();
    let accepting_scope = scope.clone();
    let accepting = tokio::spawn(async move {
        accepting_state
            .perform(LinkRequest::Accept {
                scope: accepting_scope,
            })
            .await
    });
    tokio::task::yield_now().await;
    state.perform(LinkRequest::Stop { scope }).await.unwrap();
    let rebound = TcpListener::bind(("127.0.0.1", port)).await.unwrap();
    assert_eq!(rebound.local_addr().unwrap().port(), port);
    assert!(accepting.await.unwrap().is_err());
}

#[tokio::test]
async fn loopback_listener_transfers_binary_data_and_enforces_scope() {
    let state = Arc::new(LinkState::default());
    let (scope, port) = listener(&state).await;
    let mut browser = TcpStream::connect(("127.0.0.1", port)).await.unwrap();
    let LinkReply::Socket { id } = state
        .perform(LinkRequest::Accept {
            scope: scope.clone(),
        })
        .await
        .unwrap()
    else {
        panic!("accepted socket expected");
    };
    browser.write_all(&[0, 255, 42]).await.unwrap();
    let request = LinkRequest::Read {
        scope: "different-terminal".into(),
        id: id.clone(),
    };
    assert!(state.perform(request).await.is_err());
    let LinkReply::Data { data, eof } = state
        .perform(LinkRequest::Read {
            scope: scope.clone(),
            id: id.clone(),
        })
        .await
        .unwrap()
    else {
        panic!("data reply expected")
    };
    assert!(!eof);
    assert_eq!(STANDARD.decode(data).unwrap(), vec![0, 255, 42]);
    state
        .perform(LinkRequest::Write {
            scope: scope.clone(),
            id: id.clone(),
            data: STANDARD.encode(b"reply"),
        })
        .await
        .unwrap();
    let mut reply = [0; 5];
    browser.read_exact(&mut reply).await.unwrap();
    assert_eq!(&reply, b"reply");
    state
        .perform(LinkRequest::Stop {
            scope: scope.clone(),
        })
        .await
        .unwrap();
    assert!(state
        .perform(LinkRequest::Read { scope, id })
        .await
        .is_err());
    assert!(TcpStream::connect(("127.0.0.1", port)).await.is_err());
}

#[tokio::test]
async fn remote_connection_carries_http_and_websocket_bytes_without_rewriting() {
    let server = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("http://{}/", server.local_addr().unwrap());
    let state = Arc::new(LinkState::default());
    let scope = uuid::Uuid::new_v4().to_string();
    let LinkReply::Socket { id } = state
        .perform(LinkRequest::Connect {
            scope: scope.clone(),
            url,
        })
        .await
        .unwrap()
    else {
        panic!("connected socket expected")
    };
    let (mut server, _) = server.accept().await.unwrap();
    let request =
        b"GET / HTTP/1.1\r\nHost: localhost\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n";
    state
        .perform(LinkRequest::Write {
            scope: scope.clone(),
            id: id.clone(),
            data: STANDARD.encode(request),
        })
        .await
        .unwrap();
    let mut received = vec![0; request.len()];
    server.read_exact(&mut received).await.unwrap();
    assert_eq!(received, request);
    let frame = [0x82, 3, 0, 255, 42];
    server.write_all(&frame).await.unwrap();
    let LinkReply::Data { data, .. } = state
        .perform(LinkRequest::Read {
            scope: scope.clone(),
            id: id.clone(),
        })
        .await
        .unwrap()
    else {
        panic!("data reply expected")
    };
    assert_eq!(STANDARD.decode(data).unwrap(), frame);
    state
        .perform(LinkRequest::Close {
            scope: scope.clone(),
            id: id.clone(),
        })
        .await
        .unwrap();
    assert!(state
        .perform(LinkRequest::Read { scope, id })
        .await
        .is_err());
}
