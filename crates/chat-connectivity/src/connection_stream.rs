//! Text and negotiated binary packets share one ordered encrypted stream.
use super::*;

/// Borrowed channels for one stream generation; reconnects keep the same outgoing queue.
pub(super) struct StreamChannels<'a> {
    pub(super) incoming: &'a mut mpsc::Receiver<Frame>,
    pub(super) events: &'a mpsc::Sender<Event>,
    pub(super) packets: Option<&'a mpsc::Sender<Vec<u8>>>,
}

pub(super) async fn pump(
    stream: DataPlaneTcpStream,
    channels: StreamChannels<'_>,
    route: watch::Receiver<RouteStatus>,
) -> Result<()> {
    let (read, write) = tokio::io::split(stream);
    // Each I/O future stays alive across health ticks; canceling a partial frame would corrupt framing.
    tokio::try_join!(
        read_frames(read, channels.events, channels.packets),
        write_frames(write, channels.incoming),
        monitor(route, channels.events)
    )?;
    Ok(())
}

async fn monitor(
    mut route: watch::Receiver<RouteStatus>,
    events: &mpsc::Sender<Event>,
) -> Result<()> {
    let mut previous = RouteStatus::default();
    loop {
        let status = route.borrow_and_update().clone();
        if !status.direct {
            return Err(Error::Unavailable);
        }
        if status != previous {
            events
                .send(Event::Status {
                    route: status.clone(),
                })
                .await
                .map_err(|_| Error::Closed)?;
            previous = status;
        }
        route.changed().await.map_err(|_| Error::Closed)?;
    }
}

async fn read_frames(
    mut read: impl AsyncReadExt + Unpin,
    events: &mpsc::Sender<Event>,
    packets: Option<&mpsc::Sender<Vec<u8>>>,
) -> Result<()> {
    loop {
        match framing::read(&mut read).await? {
            Frame::Text(text) => events
                .send(Event::Data { text })
                .await
                .map_err(|_| Error::Closed)?,
            Frame::Binary(bytes) => packets
                .ok_or(Error::Invalid)?
                .send(bytes)
                .await
                .map_err(|_| Error::Closed)?,
        }
    }
}

async fn write_frames(
    mut write: impl AsyncWriteExt + Unpin,
    incoming: &mut mpsc::Receiver<Frame>,
) -> Result<()> {
    while let Some(frame) = incoming.recv().await {
        framing::write(&mut write, frame).await?;
    }
    Err(Error::Closed)
}
