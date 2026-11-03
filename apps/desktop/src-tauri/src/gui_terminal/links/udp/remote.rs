use super::{
    session::{enqueue, Activity, Worker},
    *,
};
use tokio::task::JoinHandle;

struct Flow {
    socket: Arc<UdpSocket>,
    receiver: JoinHandle<()>,
    activity: Arc<Activity>,
}
impl Drop for Flow {
    fn drop(&mut self) {
        self.receiver.abort();
    }
}

pub(super) async fn run(target: SocketAddr, mut worker: Worker) -> Result<()> {
    let mut flows: HashMap<String, Flow> = HashMap::new();
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
                flows.retain(|_, flow| active(flow));
            }
            queued = worker.commands.recv() => {
                let Some(queued) = queued else { return Ok(()) };
                send(&mut flows, target, &worker.packets, queued.packet).await?;
            }
        }
    }
}

async fn send(
    flows: &mut HashMap<String, Flow>,
    target: SocketAddr,
    replies: &queue::Sender,
    packet: Datagram,
) -> Result<()> {
    flows.retain(|_, flow| active(flow));
    if !flows.contains_key(&packet.peer) {
        if flows.len() >= MAX_PEERS {
            return Ok(());
        }
        let flow = open(target, packet.peer.clone(), replies.clone()).await?;
        flows.insert(packet.peer.clone(), flow);
    }
    if let Some(flow) = flows.get_mut(&packet.peer) {
        flow.activity.touch();
        // A remote UDP service may disappear or reject a packet; keep other clients usable.
        if flow.socket.send(&packet.data).await.is_err() {
            flows.remove(&packet.peer);
        }
    }
    Ok(())
}

fn active(flow: &Flow) -> bool {
    !flow.activity.expired_after(PEER_IDLE) && !flow.receiver.is_finished()
}

async fn open(target: SocketAddr, peer: String, replies: queue::Sender) -> Result<Flow> {
    let bind = if target.is_ipv4() {
        "0.0.0.0:0"
    } else {
        "[::]:0"
    };
    let socket = Arc::new(
        UdpSocket::bind(bind)
            .await
            .map_err(|_| LinkError::Network)?,
    );
    socket
        .connect(target)
        .await
        .map_err(|_| LinkError::Network)?;
    let activity = Arc::new(Activity::new());
    let receiver = tokio::spawn(receive(socket.clone(), peer, replies, activity.clone()));
    Ok(Flow {
        socket,
        receiver,
        activity,
    })
}

async fn receive(
    socket: Arc<UdpSocket>,
    peer: String,
    replies: queue::Sender,
    activity: Arc<Activity>,
) {
    let mut bytes = vec![0; MAX_DATAGRAM + 1];
    while let Ok(size) = socket.recv(&mut bytes).await {
        if size <= MAX_DATAGRAM {
            activity.touch();
            enqueue(
                &replies,
                Datagram {
                    peer: peer.clone(),
                    data: bytes[..size].to_vec(),
                },
            );
        }
    }
}
