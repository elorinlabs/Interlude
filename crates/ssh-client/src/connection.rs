use crate::types::*;
use russh::{
    client,
    keys::{HashAlg, PrivateKeyWithHashAlg, PublicKeyOrCertificate},
    Disconnect,
};
use std::{sync::Arc, time::Duration};
use tokio::sync::Mutex;

pub(crate) const TIMEOUT: Duration = Duration::from_secs(20);
pub(crate) struct HostKey {
    expected: Option<String>,
    observed: Arc<Mutex<Option<String>>>,
    x11: Option<crate::x11::Forwarder>,
}
impl client::Handler for HostKey {
    type Error = russh::Error;
    async fn server_channel_open_x11(
        &mut self,
        channel: russh::Channel<client::Msg>,
        _originator_address: &str,
        _originator_port: u32,
        reply: client::ChannelOpenHandle,
        _session: &mut client::Session,
    ) -> std::result::Result<(), Self::Error> {
        if let Some(forwarder) = &mut self.x11 {
            forwarder.accept(channel, reply).await;
        }
        // Dropping the reply rejects unsolicited channels when forwarding is off.
        Ok(())
    }
    async fn check_server_key(
        &mut self,
        key: &PublicKeyOrCertificate,
    ) -> std::result::Result<bool, Self::Error> {
        let fingerprint = key.public_key().fingerprint(HashAlg::Sha256).to_string();
        *self.observed.lock().await = Some(fingerprint.clone());
        Ok(self
            .expected
            .as_ref()
            .is_none_or(|expected| expected == &fingerprint))
    }
}

async fn handshake(
    endpoint: &Endpoint,
    expected: Option<String>,
    x11: Option<crate::x11::Forwarder>,
) -> Result<client::Handle<HostKey>> {
    let observed = Arc::new(Mutex::new(None));
    let handler = HostKey {
        expected: expected.clone(),
        observed: observed.clone(),
        x11,
    };
    let config = client::Config {
        keepalive_interval: Some(Duration::from_secs(30)),
        keepalive_max: 3,
        ..Default::default()
    };
    let result = tokio::time::timeout(
        TIMEOUT,
        client::connect(
            Arc::new(config),
            (endpoint.host.as_str(), endpoint.port),
            handler,
        ),
    )
    .await;
    if let (Some(expected), Some(observed)) = (expected, observed.lock().await.as_ref()) {
        if &expected != observed {
            return Err(Error::HostKey);
        }
    }
    result
        .map_err(|_| Error::Connection)?
        .map_err(|_| Error::Connection)
}

/// Obtain the host fingerprint without transmitting authentication credentials.
pub async fn probe(endpoint: Endpoint) -> Result<String> {
    endpoint.validate()?;
    let observed = Arc::new(Mutex::new(None));
    let handler = HostKey {
        expected: None,
        observed: observed.clone(),
        x11: None,
    };
    let session = tokio::time::timeout(
        TIMEOUT,
        client::connect(
            Arc::new(client::Config::default()),
            (endpoint.host.as_str(), endpoint.port),
            handler,
        ),
    )
    .await
    .map_err(|_| Error::Connection)?
    .map_err(|_| Error::Connection)?;
    let fingerprint = observed.lock().await.clone().ok_or(Error::Connection)?;
    session
        .disconnect(Disconnect::ByApplication, "", "")
        .await
        .map_err(|_| Error::Connection)?;
    Ok(fingerprint)
}

pub(crate) async fn connect(
    request: &Connect,
    x11: Option<crate::x11::Forwarder>,
) -> Result<client::Handle<HostKey>> {
    request.validate()?;
    let mut session = handshake(&request.endpoint, Some(request.fingerprint.clone()), x11).await?;
    let authenticated = if let Some(key) = &request.private_key {
        // Decrypting a private key can be CPU intensive; never do it on the UI or async I/O thread.
        let key = zeroize::Zeroizing::new(key.clone());
        let passphrase = zeroize::Zeroizing::new(request.passphrase.clone());
        let key = tokio::task::spawn_blocking(move || {
            russh::keys::decode_secret_key(&key, passphrase.as_deref())
        })
        .await
        .map_err(|_| Error::Authentication)?
        .map_err(|_| Error::Authentication)?;
        let algorithm = session
            .best_supported_rsa_hash()
            .await
            .map_err(|_| Error::Authentication)?
            .flatten();
        session
            .authenticate_publickey(
                &request.username,
                PrivateKeyWithHashAlg::new(Arc::new(key), algorithm),
            )
            .await
    } else {
        session
            .authenticate_password(
                &request.username,
                request.password.as_deref().unwrap_or_default(),
            )
            .await
    }
    .map_err(|_| Error::Authentication)?;
    if !authenticated.success() {
        return Err(Error::Authentication);
    }
    Ok(session)
}
