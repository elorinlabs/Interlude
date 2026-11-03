use super::*;
use tokio::time::timeout;

const FIRST_UNPRIVILEGED_PORT: u16 = 1024;
const MAX_BIND_ATTEMPTS: usize = 32;

#[tokio::test]
async fn remote_udp_reaches_ipv6_targets() {
    let sessions = Sessions::default();
    let server = UdpSocket::bind("[::1]:0").await.unwrap();
    let LinkReply::Socket { id } = sessions
        .connect(
            "ipv6".into(),
            format!("http://{}", server.local_addr().unwrap()),
        )
        .await
        .unwrap()
    else {
        panic!()
    };
    sessions
        .write(
            "ipv6",
            &id,
            vec![Packet {
                peer: "client".into(),
                data: STANDARD.encode([1, 2, 3]),
            }],
        )
        .await
        .unwrap();
    let mut bytes = [0; 10];
    let (size, peer) = timeout(Duration::from_secs(3), server.recv_from(&mut bytes))
        .await
        .unwrap()
        .unwrap();
    assert_eq!(&bytes[..size], &[1, 2, 3]);
    server.send_to(&bytes[..size], peer).await.unwrap();
    let returned = packets(&sessions, "ipv6", &id).await;
    assert_eq!(returned[0].peer, "client");
    assert_eq!(returned[0].data, STANDARD.encode([1, 2, 3]));
    sessions.stop("ipv6").await;
}

async fn local(sessions: &Sessions) -> (String, u16) {
    let reservation = UdpSocket::bind("127.0.0.1:0").await.unwrap();
    let port = reservation.local_addr().unwrap().port();
    drop(reservation);
    let LinkReply::Listener { id, .. } = sessions.listen(port).await.unwrap() else {
        panic!()
    };
    (id, port)
}

async fn packets(sessions: &Sessions, scope: &str, id: &str) -> Vec<Packet> {
    let LinkReply::Datagrams { packets } =
        timeout(Duration::from_secs(3), sessions.read(scope, id))
            .await
            .unwrap()
            .unwrap()
    else {
        panic!()
    };
    packets
}

async fn local_with_tcp(sessions: &Sessions) -> (String, u16, tokio::net::TcpListener) {
    local_with_tcp_on_ports(sessions, candidate_ports()).await
}

fn candidate_ports() -> impl Iterator<Item = u16> {
    // Windows can allocate consecutive TCP ports inside a UDP exclusion range.
    // Spread candidates across the unprivileged range instead of repeating port-zero binds.
    std::iter::repeat_with(|| rand::random_range(FIRST_UNPRIVILEGED_PORT..=u16::MAX))
        .take(MAX_BIND_ATTEMPTS)
}

async fn local_with_tcp_on_ports(
    sessions: &Sessions,
    ports: impl Iterator<Item = u16>,
) -> (String, u16, tokio::net::TcpListener) {
    let mut last_failure = None;
    for port in ports {
        let tcp = match tokio::net::TcpListener::bind(("127.0.0.1", port)).await {
            Ok(listener) => listener,
            Err(error)
                if matches!(
                    error.kind(),
                    std::io::ErrorKind::AddrInUse | std::io::ErrorKind::PermissionDenied
                ) =>
            {
                last_failure = Some(format!("TCP port {port}: {error}"));
                continue;
            }
            Err(error) => panic!("TCP port {port} bind failed: {error}"),
        };
        // Bind the actual session while TCP stays reserved; there is no UDP probe/rebind gap.
        match sessions.listen(port).await {
            Ok(LinkReply::Listener { id, .. }) => return (id, port, tcp),
            Err(error @ (LinkError::PortInUse | LinkError::Listen)) => {
                last_failure = Some(format!("UDP port {port}: {error}"));
            }
            result => panic!("Unexpected UDP listener result on port {port}: {result:?}"),
        }
    }
    panic!("No port available for both TCP and UDP; last bind failure: {last_failure:?}");
}

#[tokio::test]
async fn shared_port_selection_skips_ports_occupied_by_either_protocol() {
    let sessions = Sessions::default();
    let tcp = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let tcp_port = tcp.local_addr().unwrap().port();
    let (udp_id, udp_port) = local(&sessions).await;
    let candidates = [tcp_port, udp_port].into_iter().chain(candidate_ports());
    let (id, port, listener) = local_with_tcp_on_ports(&sessions, candidates).await;
    assert_ne!(port, tcp_port);
    assert_ne!(port, udp_port);
    assert_eq!(listener.local_addr().unwrap().port(), port);
    assert!(matches!(
        sessions.listen(port).await,
        Err(LinkError::PortInUse)
    ));
    sessions.stop(&id).await;
    sessions.stop(&udp_id).await;
}

#[tokio::test]
async fn datagrams_roundtrip_separate_clients_preserving_empty_binary_and_large_packets() {
    let sessions = Sessions::default();
    let (local, port, tcp) = local_with_tcp(&sessions).await;
    let echo = UdpSocket::bind("127.0.0.1:0").await.unwrap();
    let LinkReply::Socket { id: remote } = sessions
        .connect(
            "resource".into(),
            format!("http://{}", echo.local_addr().unwrap()),
        )
        .await
        .unwrap()
    else {
        panic!()
    };
    let clients = [
        UdpSocket::bind("127.0.0.1:0").await.unwrap(),
        UdpSocket::bind("127.0.0.1:0").await.unwrap(),
    ];
    let mut server_peers = Vec::new();
    for (index, data) in [vec![], vec![0, 255, 128], vec![93; MAX_DATAGRAM]]
        .iter()
        .enumerate()
    {
        let client = &clients[index % 2];
        client.send_to(data, ("127.0.0.1", port)).await.unwrap();
        let outgoing = packets(&sessions, &local, &local).await;
        assert_eq!(outgoing.len(), 1);
        sessions.write("resource", &remote, outgoing).await.unwrap();
        let mut bytes = vec![0; MAX_DATAGRAM + 1];
        let (size, address) = timeout(Duration::from_secs(3), echo.recv_from(&mut bytes))
            .await
            .unwrap()
            .unwrap();
        assert_eq!(&bytes[..size], data);
        server_peers.push(address);
        echo.send_to(&bytes[..size], address).await.unwrap();
        let incoming = packets(&sessions, "resource", &remote).await;
        sessions.write(&local, &local, incoming).await.unwrap();
        let (size, _) = timeout(Duration::from_secs(3), client.recv_from(&mut bytes))
            .await
            .unwrap()
            .unwrap();
        assert_eq!(&bytes[..size], data);
    }
    assert_ne!(server_peers[0], server_peers[1]);
    assert_eq!(server_peers[0], server_peers[2]);
    sessions.stop("resource").await;
    sessions.stop(&local).await;
    drop(tcp);
}

#[tokio::test]
async fn port_conflicts_scope_isolation_cancellation_and_immediate_reuse() {
    let sessions = Arc::new(Sessions::default());
    let (id, port) = local(&sessions).await;
    assert!(matches!(
        sessions.listen(port).await,
        Err(LinkError::PortInUse)
    ));
    assert!(sessions.read("wrong-owner", &id).await.is_err());
    assert!(sessions.close("wrong-owner", &id).await.is_err());
    let reader = sessions.clone();
    let scope = id.clone();
    let pending = tokio::spawn(async move { reader.read(&scope, &scope).await });
    tokio::task::yield_now().await;
    sessions.stop(&id).await;
    assert!(timeout(Duration::from_secs(1), pending)
        .await
        .unwrap()
        .unwrap()
        .is_err());
    assert!(UdpSocket::bind(("127.0.0.1", port)).await.is_ok());
}

#[tokio::test]
async fn delayed_reader_preserves_a_128_datagram_burst_from_four_clients() {
    let sessions = Sessions::default();
    let (id, port) = local(&sessions).await;
    let mut clients = Vec::new();
    for _ in 0..4 {
        clients.push(UdpSocket::bind("127.0.0.1:0").await.unwrap());
    }
    for sequence in 0u16..128 {
        clients[sequence as usize % 4]
            .send_to(&sequence.to_be_bytes(), ("127.0.0.1", port))
            .await
            .unwrap();
    }
    tokio::time::sleep(Duration::from_millis(30)).await;
    let mut received = Vec::new();
    while received.len() < 128 {
        received.extend(packets(&sessions, &id, &id).await);
    }
    let peers: std::collections::HashSet<_> =
        received.iter().map(|packet| packet.peer.clone()).collect();
    assert_eq!(peers.len(), 4);
    let mut sequence: Vec<_> = received
        .iter()
        .map(|packet| {
            let bytes = STANDARD.decode(&packet.data).unwrap();
            u16::from_be_bytes(bytes.try_into().unwrap())
        })
        .collect();
    sequence.sort_unstable();
    assert_eq!(sequence, (0u16..128).collect::<Vec<_>>());
    sessions.stop(&id).await;
}

#[test]
fn validates_datagram_and_peer_limits_before_enqueuing_any_packets() {
    assert!(decode(Packet {
        peer: "peer-1".into(),
        data: String::new()
    })
    .is_ok());
    assert!(decode(Packet {
        peer: "127.0.0.1:80".into(),
        data: String::new()
    })
    .is_err());
    assert!(decode(Packet {
        peer: "p".repeat(65),
        data: String::new()
    })
    .is_err());
    assert!(decode(Packet {
        peer: "peer".into(),
        data: "?".into()
    })
    .is_err());
    assert!(decode(Packet {
        peer: "peer".into(),
        data: STANDARD.encode(vec![0; MAX_DATAGRAM + 1])
    })
    .is_err());
}
