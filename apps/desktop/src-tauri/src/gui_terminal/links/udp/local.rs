use super::{
    session::{enqueue, Worker},
    *,
};
use std::time::Instant;

struct Peer {
    address: SocketAddr,
    seen: Instant,
}

pub(super) async fn run(socket: UdpSocket, mut worker: Worker) -> Result<()> {
    let mut peers: HashMap<String, Peer> = HashMap::new();
    let mut bytes = vec![0; MAX_DATAGRAM + 1];
    let mut cleanup = tokio::time::interval(Duration::from_secs(15));
    loop {
        if *worker.cancel.borrow() {
            return Ok(());
        }
        tokio::select! {
            biased;
            _ = worker.cancel.changed() => return Ok(()),
            _ = cleanup.tick() => {
                if worker.activity.expired() { return Ok(()); }
                peers.retain(|_, peer| peer.seen.elapsed() < PEER_IDLE);
            }
            queued = worker.commands.recv() => {
                let Some(queued) = queued else { return Ok(()) };
                let packet = &queued.packet;
                if let Some(peer) = peers.get_mut(&packet.peer) {
                    peer.seen = Instant::now();
                    socket.send_to(&packet.data, peer.address).await.map_err(|_| LinkError::Network)?;
                }
            }
            received = socket.recv_from(&mut bytes) => {
                let (size, address) = received.map_err(|_| LinkError::Network)?;
                if !address.ip().is_loopback() || size > MAX_DATAGRAM { continue; }
                if let Some(peer) = identify(&mut peers, address) {
                    enqueue(&worker.packets, Datagram { peer, data: bytes[..size].to_vec() });
                }
            }
        }
    }
}

fn identify(peers: &mut HashMap<String, Peer>, address: SocketAddr) -> Option<String> {
    if let Some((id, peer)) = peers.iter_mut().find(|(_, peer)| peer.address == address) {
        peer.seen = Instant::now();
        return Some(id.clone());
    }
    peers.retain(|_, peer| peer.seen.elapsed() < PEER_IDLE);
    if peers.len() >= MAX_PEERS {
        return None;
    }
    let id = uuid::Uuid::new_v4().to_string();
    peers.insert(
        id.clone(),
        Peer {
            address,
            seen: Instant::now(),
        },
    );
    Some(id)
}
