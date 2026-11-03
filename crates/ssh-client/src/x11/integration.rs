use crate::{Client, Command, Error, Info, X11};
use russh::{
    keys::{ssh_key::private::Ed25519Keypair, HashAlg, PrivateKey},
    server, Channel, ChannelId,
};
use serde_json::json;
use std::{sync::Arc, time::Duration};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpListener,
    sync::{oneshot, Mutex, Notify},
};

#[derive(Default)]
struct Requests {
    cookie: String,
    screen: u32,
}

struct Server {
    requests: Arc<Mutex<Requests>>,
    channels: Vec<Channel<server::Msg>>,
    reject_x11: bool,
    sftp: Arc<Notify>,
}
impl server::Handler for Server {
    type Error = russh::Error;
    async fn subsystem_request(
        &mut self,
        channel: ChannelId,
        _: &str,
        session: &mut server::Session,
    ) -> Result<(), Self::Error> {
        // Deliberately stall SFTP initialization to exercise terminal cleanup.
        self.sftp.notify_one();
        session.channel_success(channel)
    }
    async fn auth_password(&mut self, _: &str, _: &str) -> Result<server::Auth, Self::Error> {
        Ok(server::Auth::Accept)
    }
    async fn channel_open_session(
        &mut self,
        channel: Channel<server::Msg>,
        reply: server::ChannelOpenHandle,
        _: &mut server::Session,
    ) -> Result<(), Self::Error> {
        self.channels.push(channel);
        reply.accept().await;
        Ok(())
    }
    async fn x11_request(
        &mut self,
        channel: ChannelId,
        _: bool,
        protocol: &str,
        cookie: &str,
        screen: u32,
        session: &mut server::Session,
    ) -> Result<(), Self::Error> {
        assert_eq!(protocol, "MIT-MAGIC-COOKIE-1");
        *self.requests.lock().await = Requests {
            cookie: cookie.into(),
            screen,
        };
        if self.reject_x11 {
            session.channel_failure(channel)
        } else {
            session.channel_success(channel)
        }
    }
    async fn shell_request(
        &mut self,
        channel: ChannelId,
        session: &mut server::Session,
    ) -> Result<(), Self::Error> {
        session.channel_success(channel)
    }
    async fn exec_request(
        &mut self,
        channel: ChannelId,
        command: &[u8],
        session: &mut server::Session,
    ) -> Result<(), Self::Error> {
        if command.starts_with(b"printf '__REMOTEAI_SHELL__") {
            session.channel_failure(channel)
        } else {
            session.channel_success(channel)
        }
    }
    async fn channel_close(
        &mut self,
        channel: ChannelId,
        session: &mut server::Session,
    ) -> Result<(), Self::Error> {
        session.close(channel)
    }
}

struct Fixture {
    client: Arc<Client>,
    info: crate::Result<Info>,
    handle: server::Handle,
    requests: Arc<Mutex<Requests>>,
    sftp: Arc<Notify>,
}

async fn fixture(x11: Option<X11>, reject_x11: bool) -> Fixture {
    let key = PrivateKey::from(Ed25519Keypair::from_seed(&[42; 32]));
    let fingerprint = key.public_key().fingerprint(HashAlg::Sha256).to_string();
    let config = Arc::new(server::Config {
        keys: vec![key],
        ..Default::default()
    });
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();
    let requests = Arc::new(Mutex::new(Requests::default()));
    let sftp = Arc::new(Notify::new());
    let handler = Server {
        requests: requests.clone(),
        channels: Vec::new(),
        reject_x11,
        sftp: sftp.clone(),
    };
    let (send, receive) = oneshot::channel();
    tokio::spawn(async move {
        let (socket, _) = listener.accept().await.unwrap();
        let session = server::run_stream(config, socket, handler).await.unwrap();
        send.send(session.handle()).unwrap();
        // The client intentionally disconnects at the end of each fixture.
        let _result = session.await;
    });
    let client = Arc::new(Client::default());
    let request =
        serde_json::from_value(json!({ "endpoint": { "host": "127.0.0.1", "port": port },
        "username": "fixture", "password": "fixture", "fingerprint": fingerprint,
        "size": { "cols": 80, "rows": 24 }, "x11": x11 }))
        .unwrap();
    let info = client.open(request, Arc::new(|_| true)).await;
    Fixture {
        client,
        info,
        handle: receive.await.unwrap(),
        requests,
        sftp,
    }
}

fn packet(cookie: &str) -> Vec<u8> {
    let mut packet = vec![b'l', 0, 11, 0, 0, 0, 18, 0, 16, 0, 0, 0];
    packet.extend_from_slice(b"MIT-MAGIC-COOKIE-1\0\0");
    for index in (0..cookie.len()).step_by(2) {
        packet.push(u8::from_str_radix(&cookie[index..index + 2], 16).unwrap());
    }
    packet
}

async fn x_server() -> (Arc<TcpListener>, X11) {
    let listener = Arc::new(TcpListener::bind("127.0.0.1:0").await.unwrap());
    let port = listener.local_addr().unwrap().port();
    assert!(port >= 6000);
    let readiness = listener.clone();
    tokio::spawn(async move {
        drop(readiness.accept().await.unwrap());
        let (mut probe, _) = readiness.accept().await.unwrap();
        let mut header = [0; 12];
        probe.read_exact(&mut header).await.unwrap();
        assert_eq!(header, [b'l', 0, 11, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
        probe.write_all(&[1, 0, 11, 0, 0, 0, 0, 0]).await.unwrap();
    });
    (
        listener,
        X11 {
            display: Some(format!("127.0.0.1:{}.2", port - 6000)),
        },
    )
}

#[tokio::test]
async fn reverse_x11_channel_roundtrip_and_session_cleanup() {
    tokio::time::timeout(Duration::from_secs(10), async {
        let (listener, options) = x_server().await;
        let fixture = fixture(Some(options), false).await;
        let info = fixture.info.unwrap();
        let requests = fixture.requests.lock().await;
        assert_eq!(requests.screen, 2);
        assert_eq!(requests.cookie.len(), 32);
        let mut remote = fixture
            .handle
            .channel_open_x11("127.0.0.1", 1234)
            .await
            .unwrap()
            .into_stream();
        remote.write_all(&packet(&requests.cookie)).await.unwrap();
        drop(requests);
        let (mut local, _) = listener.accept().await.unwrap();
        let mut header = [0; 12];
        local.read_exact(&mut header).await.unwrap();
        assert_eq!(header, [b'l', 0, 11, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
        local.write_all(b"X response").await.unwrap();
        let mut response = [0; 10];
        remote.read_exact(&mut response).await.unwrap();
        assert_eq!(&response, b"X response");
        remote.write_all(b"X request").await.unwrap();
        let mut request = [0; 9];
        local.read_exact(&mut request).await.unwrap();
        assert_eq!(&request, b"X request");
        let client = fixture.client.clone();
        let id = info.id.clone();
        tokio::spawn(async move {
            // The fixture intentionally keeps this request pending through close.
            let _result = client
                .files(&id, crate::FileAction::List { path: ".".into() })
                .await;
        });
        fixture.sftp.notified().await;
        fixture
            .client
            .command(Command::Close { id: info.id })
            .await
            .unwrap();
        assert_eq!(local.read(&mut [0; 1]).await.unwrap(), 0);
    })
    .await
    .expect("forwarding and cleanup deadline");
}

#[tokio::test]
async fn disabled_and_rejected_forwarding_do_not_accept_channels() {
    tokio::time::timeout(Duration::from_secs(10), async {
        let disabled = fixture(None, false).await;
        assert!(disabled
            .handle
            .channel_open_x11("127.0.0.1", 1234)
            .await
            .is_err());
        disabled
            .client
            .command(Command::Close {
                id: disabled.info.unwrap().id,
            })
            .await
            .unwrap();
        let (_listener, options) = x_server().await;
        assert!(matches!(
            fixture(Some(options), true).await.info,
            Err(Error::X11Rejected)
        ));
    })
    .await
    .expect("rejected forwarding deadline");
}

#[tokio::test]
async fn incorrect_cookie_never_reaches_local_server() {
    tokio::time::timeout(Duration::from_secs(10), async {
        let (listener, options) = x_server().await;
        let fixture = fixture(Some(options), false).await;
        let mut remote = fixture
            .handle
            .channel_open_x11("127.0.0.1", 1234)
            .await
            .unwrap()
            .into_stream();
        remote
            .write_all(&packet("00000000000000000000000000000000"))
            .await
            .unwrap();
        assert_eq!(remote.read(&mut [0; 1]).await.unwrap(), 0);
        assert!(
            tokio::time::timeout(Duration::from_millis(50), listener.accept())
                .await
                .is_err()
        );
        fixture
            .client
            .command(Command::Close {
                id: fixture.info.unwrap().id,
            })
            .await
            .unwrap();
    })
    .await
    .expect("invalid cookie deadline");
}
