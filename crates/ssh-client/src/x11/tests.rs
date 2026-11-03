use super::{authority, display::Display, protocol};
use crate::{Error, X11};
use tokio::io::{AsyncReadExt, AsyncWriteExt};

fn setup_packet(cookie: &[u8], little: bool) -> Vec<u8> {
    let word = |value: u16| {
        if little {
            value.to_le_bytes()
        } else {
            value.to_be_bytes()
        }
    };
    let mut packet = vec![if little { b'l' } else { b'B' }, 0];
    packet.extend_from_slice(&word(11));
    packet.extend_from_slice(&word(0));
    packet.extend_from_slice(&word(18));
    packet.extend_from_slice(&word(cookie.len() as u16));
    packet.extend_from_slice(&[0, 0]);
    packet.extend_from_slice(authority::AUTH_PROTOCOL);
    packet.extend_from_slice(&[0, 0]);
    packet.extend_from_slice(cookie);
    packet
}

#[test]
fn display_only_targets_local_x_servers() {
    for value in [
        ":0",
        ":1.2",
        "unix:5",
        "localhost:10",
        "127.0.0.1:0.0",
        "[::1]:12",
        ":59535.65535",
    ] {
        assert!(Display::parse(value).is_ok(), "{value}");
    }
    for value in [
        "",
        ":",
        ":-1",
        ":+1",
        ":0.+1",
        ":59536",
        ":0.65536",
        "remote:0",
        "127.0.0.2:0",
        "/tmp/socket:0",
        ":0\n",
        " :0",
        ":0.0.0",
        "localhost:0/../22",
        "unix:/tmp/socket",
    ] {
        assert!(Display::parse(value).is_err(), "{value}");
    }
    let display = Display::parse("localhost:10.3").unwrap();
    assert_eq!(display.number, 10);
    assert_eq!(display.screen, 3);
    assert!(X11 { display: None }.validate().is_ok());
}

#[tokio::test]
async fn replaces_fake_cookie_in_both_byte_orders_without_consuming_following_data() {
    for little in [true, false] {
        let fake = [5; 16];
        let real = [9; 16];
        let mut packet = setup_packet(&fake, little);
        packet.extend_from_slice(b"next request");
        let mut stream = packet.as_slice();
        let result = protocol::setup(&mut stream, &fake, &real).await.unwrap();
        assert_eq!(*result, setup_packet(&real, little));
        assert_eq!(stream, b"next request");
    }
}

#[tokio::test]
async fn handles_fragmented_setup_and_servers_using_local_access_control() {
    let fake = [5; 16];
    let packet = setup_packet(&fake, true);
    let (mut sender, mut receiver) = tokio::io::duplex(8);
    let writer = tokio::spawn(async move {
        for byte in packet {
            sender.write_all(&[byte]).await.unwrap();
        }
    });
    let result = protocol::setup(&mut receiver, &fake, &[]).await.unwrap();
    assert_eq!(*result, [b'l', 0, 11, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    writer.await.unwrap();
}

#[tokio::test]
async fn rejects_wrong_authentication_and_oversized_setup_before_allocation() {
    let fake = [5; 16];
    let valid = setup_packet(&fake, true);
    for (position, replacement) in [(0, b'x'), (2, 12), (6, 255), (8, 255), (12, b'X'), (32, 0)] {
        let mut packet = valid.clone();
        packet[position] = replacement;
        assert!(matches!(
            protocol::setup(&mut packet.as_slice(), &fake, &[]).await,
            Err(Error::X11Rejected)
        ));
    }
    assert!(protocol::setup(&mut &valid[..20], &fake, &[])
        .await
        .is_err());
}

fn authority_record(family: u16, display: &[u8], cookie: &[u8]) -> Vec<u8> {
    let mut bytes = family.to_be_bytes().to_vec();
    for field in [&b"host"[..], display, authority::AUTH_PROTOCOL, cookie] {
        bytes.extend_from_slice(&(field.len() as u16).to_be_bytes());
        bytes.extend_from_slice(field);
    }
    bytes
}

#[test]
fn reads_matching_mit_cookie_and_rejects_malformed_authority_files() {
    let mut bytes = authority_record(256, b"1", &[1; 16]);
    bytes.extend(authority_record(256, b"2", &[2; 16]));
    assert_eq!(*authority::parse(&bytes, b"2").unwrap(), [2; 16]);
    assert!(authority::parse(&bytes, b"3").unwrap().is_empty());
    assert!(authority::parse(&authority_record(1, b"2", &[2; 16]), b"2")
        .unwrap()
        .is_empty());
    assert!(authority::parse(&bytes[..bytes.len() - 1], b"2").is_err());
}

#[tokio::test]
async fn loopback_display_connects_to_selected_x_server() {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();
    assert!(port >= 6000);
    let display = Display::parse(&format!("127.0.0.1:{}", port - 6000)).unwrap();
    let mut client = display.connect().await.unwrap();
    let (mut server, _) = listener.accept().await.unwrap();
    client.write_all(b"X11").await.unwrap();
    let mut bytes = [0; 3];
    server.read_exact(&mut bytes).await.unwrap();
    assert_eq!(&bytes, b"X11");
}
