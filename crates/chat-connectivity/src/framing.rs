//! Binary frames are negotiated by package peers; existing text sessions keep their wire format.
use tokio::io::{AsyncReadExt, AsyncWriteExt};

use crate::{Error, Result};

pub(crate) const MAX_FRAME: usize = 128 * 1024;
const BINARY_FLAG: u32 = 1 << 31;

pub(crate) enum Frame {
    Text(String),
    Binary(Vec<u8>),
}

pub(crate) async fn read(read: &mut (impl AsyncReadExt + Unpin)) -> Result<Frame> {
    let header = read.read_u32().await?;
    let length = (header & !BINARY_FLAG) as usize;
    if length == 0 || length > MAX_FRAME {
        return Err(Error::Invalid);
    }
    let mut bytes = vec![0; length];
    read.read_exact(&mut bytes).await?;
    if header & BINARY_FLAG != 0 {
        return Ok(Frame::Binary(bytes));
    }
    Ok(Frame::Text(
        String::from_utf8(bytes).map_err(|_| Error::Invalid)?,
    ))
}

pub(crate) async fn write(write: &mut (impl AsyncWriteExt + Unpin), frame: Frame) -> Result<()> {
    let (bytes, flag) = match frame {
        Frame::Text(text) => (text.into_bytes(), 0),
        Frame::Binary(bytes) => (bytes, BINARY_FLAG),
    };
    if bytes.is_empty() || bytes.len() > MAX_FRAME {
        return Err(Error::Invalid);
    }
    write.write_u32(bytes.len() as u32 | flag).await?;
    write.write_all(&bytes).await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn text_and_binary_frames_preserve_boundaries() {
        let (mut a, mut b) = tokio::io::duplex(1024);
        write(&mut a, Frame::Text("hello".into())).await.unwrap();
        write(&mut a, Frame::Binary(vec![0, 255, 42]))
            .await
            .unwrap();
        assert!(matches!(read(&mut b).await.unwrap(), Frame::Text(text) if text == "hello"));
        assert!(
            matches!(read(&mut b).await.unwrap(), Frame::Binary(bytes) if bytes == [0, 255, 42])
        );
        a.write_u32(BINARY_FLAG | (MAX_FRAME as u32 + 1))
            .await
            .unwrap();
        assert!(read(&mut b).await.is_err());
    }
}
