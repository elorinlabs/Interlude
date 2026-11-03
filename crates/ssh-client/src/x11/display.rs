use crate::{Error, Result};
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};
use tokio::io::{AsyncRead, AsyncWrite};

const X11_BASE_PORT: u16 = 6000;

#[derive(Clone, Debug)]
pub(super) enum Address {
    Tcp(IpAddr, u16),
    #[cfg(unix)]
    Unix(String),
}

#[derive(Clone, Debug)]
pub(super) struct Display {
    pub address: Address,
    pub number: u16,
    pub screen: u16,
}

pub(super) trait Stream: AsyncRead + AsyncWrite + Unpin + Send {}
impl<T: AsyncRead + AsyncWrite + Unpin + Send> Stream for T {}

impl Display {
    pub fn parse(value: &str) -> Result<Self> {
        if value.len() > 256 || value.chars().any(|c| c.is_control() || c.is_whitespace()) {
            return Err(Error::X11Display);
        }
        let (host, suffix) = value.rsplit_once(':').ok_or(Error::X11Display)?;
        let (number, screen) = suffix.split_once('.').unwrap_or((suffix, "0"));
        if !number.bytes().all(|value| value.is_ascii_digit())
            || !screen.bytes().all(|value| value.is_ascii_digit())
        {
            return Err(Error::X11Display);
        }
        let number = number.parse::<u16>().map_err(|_| Error::X11Display)?;
        let screen = screen.parse::<u16>().map_err(|_| Error::X11Display)?;
        let port = X11_BASE_PORT.checked_add(number).ok_or(Error::X11Display)?;
        let address = match host {
            "" | "unix" => local_address(number),
            "localhost" | "127.0.0.1" => Address::Tcp(Ipv4Addr::LOCALHOST.into(), port),
            "[::1]" => Address::Tcp(Ipv6Addr::LOCALHOST.into(), port),
            _ => return Err(Error::X11Display),
        };
        Ok(Self {
            address,
            number,
            screen,
        })
    }

    pub fn from_environment(value: &str) -> Result<Self> {
        // XQuartz publishes an absolute launchd socket path in DISPLAY. Only the
        // local process environment can select a socket; IPC cannot select files.
        #[cfg(unix)]
        if value.starts_with('/') && value.len() <= 256 && !value.chars().any(char::is_control) {
            let suffix = value.rsplit_once(':').ok_or(Error::X11Display)?.1;
            let parsed = Self::parse(&format!(":{suffix}"))?;
            return Ok(Self {
                address: Address::Unix(value.into()),
                ..parsed
            });
        }
        Self::parse(value)
    }

    pub async fn connect(&self) -> Result<Box<dyn Stream>> {
        let stream: Box<dyn Stream> = match &self.address {
            Address::Tcp(host, port) => Box::new(
                tokio::net::TcpStream::connect((*host, *port))
                    .await
                    .map_err(|_| Error::X11Unavailable)?,
            ),
            #[cfg(unix)]
            Address::Unix(path) => Box::new(
                tokio::net::UnixStream::connect(path)
                    .await
                    .map_err(|_| Error::X11Unavailable)?,
            ),
        };
        Ok(stream)
    }
}

#[cfg(unix)]
fn local_address(number: u16) -> Address {
    Address::Unix(format!("/tmp/.X11-unix/X{number}"))
}

#[cfg(not(unix))]
fn local_address(number: u16) -> Address {
    Address::Tcp(Ipv4Addr::LOCALHOST.into(), X11_BASE_PORT + number)
}
