use super::{Error, Result, MAX_PACKAGE_BYTES};
use reqwest::{
    header::{CONTENT_RANGE, RANGE},
    Client, Response, StatusCode,
};
use std::time::Duration;

const DOWNLOAD_USER_AGENT: &str = "Interlude-UpdateDownload";

pub(super) struct Origin {
    client: Client,
    url: String,
    response: Option<Response>,
    buffered: Vec<u8>,
    cursor: usize,
    offset: usize,
    end: usize,
}

impl Origin {
    pub fn new(url: &str) -> Result<Self> {
        let parsed = url::Url::parse(url).map_err(|_| Error::Invalid)?;
        // Metadata is selected by the existing official updater, never supplied by a peer.
        if parsed.scheme() != "https" && !(cfg!(test) && parsed.host_str() == Some("127.0.0.1")) {
            return Err(Error::Invalid);
        }
        Ok(Self {
            url: url.into(),
            response: None,
            buffered: Vec::new(),
            cursor: 0,
            offset: 0,
            end: 0,
            client: Client::builder()
                .user_agent(DOWNLOAD_USER_AGENT)
                .connect_timeout(Duration::from_secs(10))
                .read_timeout(Duration::from_secs(8))
                .build()
                .map_err(|_| Error::Unavailable)?,
        })
    }

    pub async fn size(&self) -> Result<usize> {
        let response = self.request(0, 1).await?;
        let (start, end, size) = content_range(&response)?;
        if start != 0 || end != 0 || size == 0 || size > MAX_PACKAGE_BYTES {
            return Err(Error::Invalid);
        }
        Ok(size)
    }

    async fn request(&self, offset: usize, length: usize) -> Result<Response> {
        self.client
            .get(&self.url)
            .header(reqwest::header::ACCEPT, "application/octet-stream")
            .header(RANGE, format!("bytes={offset}-{}", offset + length - 1))
            .header(reqwest::header::ACCEPT_ENCODING, "identity")
            .send()
            .await
            .map_err(|_| Error::Unavailable)
    }

    pub async fn block(&mut self, offset: usize, length: usize, size: usize) -> Result<Vec<u8>> {
        if length == 0 || offset.checked_add(length).is_none_or(|end| end > size) {
            return Err(Error::Invalid);
        }
        if self.response.is_none() || offset != self.offset {
            self.open(offset, size).await?;
        }
        let mut bytes = Vec::with_capacity(length);
        while bytes.len() < length {
            if self.cursor == self.buffered.len() {
                let chunk = self
                    .response
                    .as_mut()
                    .ok_or(Error::Invalid)?
                    .chunk()
                    .await
                    .map_err(|_| Error::Unavailable)?
                    .ok_or(Error::Invalid)?;
                if chunk.len() > self.end - self.offset {
                    return Err(Error::Invalid);
                }
                self.buffered = chunk.to_vec();
                self.cursor = 0;
            }
            let count = (length - bytes.len()).min(self.buffered.len() - self.cursor);
            bytes.extend_from_slice(&self.buffered[self.cursor..self.cursor + count]);
            self.cursor += count;
            self.offset += count;
        }
        if self.offset == self.end {
            if self.cursor != self.buffered.len()
                || self
                    .response
                    .as_mut()
                    .ok_or(Error::Invalid)?
                    .chunk()
                    .await
                    .map_err(|_| Error::Unavailable)?
                    .is_some()
            {
                return Err(Error::Invalid);
            }
            self.response = None;
        }
        Ok(bytes)
    }

    async fn open(&mut self, offset: usize, size: usize) -> Result<()> {
        const RESPONSE_BYTES: usize = 8 * 1024 * 1024;
        self.response = None;
        self.buffered.clear();
        self.cursor = 0;
        let end = size.min(offset + RESPONSE_BYTES);
        let response = self.request(offset, end - offset).await?;
        if content_range(&response)? != (offset, end - 1, size) {
            return Err(Error::Invalid);
        }
        self.response = Some(response);
        self.offset = offset;
        self.end = end;
        Ok(())
    }
}

fn content_range(response: &Response) -> Result<(usize, usize, usize)> {
    if response.status() != StatusCode::PARTIAL_CONTENT {
        return Err(Error::Unavailable);
    }
    let value = response
        .headers()
        .get(CONTENT_RANGE)
        .and_then(|v| v.to_str().ok())
        .ok_or(Error::Invalid)?;
    parse_range(value)
}

fn parse_range(value: &str) -> Result<(usize, usize, usize)> {
    let (range, size) = value
        .strip_prefix("bytes ")
        .and_then(|v| v.split_once('/'))
        .ok_or(Error::Invalid)?;
    let (start, end) = range.split_once('-').ok_or(Error::Invalid)?;
    let parse = |value: &str| value.parse::<usize>().map_err(|_| Error::Invalid);
    let (start, end, size) = (parse(start)?, parse(end)?, parse(size)?);
    if start > end || end >= size || size > MAX_PACKAGE_BYTES {
        return Err(Error::Invalid);
    }
    Ok((start, end, size))
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    #[tokio::test]
    async fn size_probe_requires_the_requested_single_byte_range() {
        for (range, accepted) in [("0-0", true), ("1-1", false), ("0-1", false)] {
            let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
            let url = format!("http://{}/package", listener.local_addr().unwrap());
            let server = tokio::spawn(async move {
                let (mut socket, _) = listener.accept().await.unwrap();
                let mut request = Vec::new();
                while !request.ends_with(b"\r\n\r\n") {
                    assert!(request.len() < 4096);
                    request.push(socket.read_u8().await.unwrap());
                }
                let request = String::from_utf8(request).unwrap().to_ascii_lowercase();
                assert!(request.contains("\r\nuser-agent: remoteai-updatedownload\r\n"));
                assert!(request.contains("\r\naccept: application/octet-stream\r\n"));
                let response = format!(
                    "HTTP/1.1 206 Partial Content\r\nContent-Range: bytes {range}/10\r\nContent-Length: 1\r\n\r\nx"
                );
                socket.write_all(response.as_bytes()).await.unwrap();
            });
            let result = Origin::new(&url).unwrap().size().await;
            assert_eq!(result.is_ok(), accepted, "range: {range}");
            server.await.unwrap();
        }
    }

    #[test]
    fn rejects_ambiguous_or_out_of_bounds_ranges() {
        assert_eq!(parse_range("bytes 0-1023/2048").unwrap(), (0, 1023, 2048));
        for value in ["bytes */2048", "bytes 4-2/8", "bytes 0-8/8", "bytes 0-0/0"] {
            assert!(parse_range(value).is_err());
        }
    }
}
