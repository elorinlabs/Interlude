use super::*;
use std::sync::{
    atomic::{AtomicUsize, Ordering},
    Arc,
};
use tokio::net::TcpListener;

#[tokio::test]
async fn reuses_ready_server_for_concurrent_requests() {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();
    let handshakes = Arc::new(AtomicUsize::new(0));
    let count = handshakes.clone();
    let server = tokio::spawn(async move {
        for _ in 0..6 {
            let (mut socket, _) = listener.accept().await.unwrap();
            let mut header = [0; 12];
            if socket.read_exact(&mut header).await.is_err() {
                continue;
            }
            assert_eq!(&header[..6], &[b'l', 0, 11, 0, 0, 0]);
            socket.write_all(&[1, 0, 11, 0, 0, 0, 0, 0]).await.unwrap();
            count.fetch_add(1, Ordering::SeqCst);
        }
    });
    let options = X11 {
        display: Some(format!("127.0.0.1:{}", port - 6000)),
    };
    let (first, second, third) = tokio::join!(
        ensure_x11(options.clone()),
        ensure_x11(options.clone()),
        ensure_x11(options)
    );
    first.unwrap();
    second.unwrap();
    third.unwrap();
    server.await.unwrap();
    assert_eq!(handshakes.load(Ordering::SeqCst), 3);
}

#[tokio::test]
async fn rejects_occupied_non_x11_port_instead_of_starting_another_server() {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();
    let server = tokio::spawn(async move {
        drop(listener.accept().await.unwrap());
        let (mut socket, _) = listener.accept().await.unwrap();
        let mut header = [0; 12];
        socket.read_exact(&mut header).await.unwrap();
        socket.write_all(b"HTTP/1.1").await.unwrap();
    });
    let result = ensure_x11(X11 {
        display: Some(format!("127.0.0.1:{}", port - 6000)),
    })
    .await;
    assert!(matches!(result, Err(Error::X11Unavailable)));
    server.await.unwrap();
}

#[tokio::test]
async fn invalid_display_is_rejected_before_launching() {
    assert!(matches!(
        ensure_x11(X11 {
            display: Some("remote:0".into())
        })
        .await,
        Err(Error::X11Display)
    ));
}

#[test]
fn readiness_request_uses_the_local_cookie_and_padded_protocol() {
    let cookie = [5; 16];
    let packet = setup_packet(&cookie);
    assert_eq!(&packet[..12], &[b'l', 0, 11, 0, 0, 0, 18, 0, 16, 0, 0, 0]);
    assert_eq!(&packet[12..30], authority::AUTH_PROTOCOL);
    assert_eq!(&packet[32..], cookie);
    assert_eq!(*setup_packet(&[]), [b'l', 0, 11, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
}
