use std::{
    collections::HashMap,
    sync::Arc,
    time::{Duration, Instant},
};

use csw_chat_connectivity::{Config, Connection};
use serde::Deserialize;
use serde_json::{json, Value};
use tauri::{Manager, Runtime};
use tokio::sync::{mpsc, oneshot};

use super::{cache, transfer, Error, Result, Service, MAX_DOWNLOAD_PEERS, TRANSFER_LIFETIME};

const LOOKUP_TIMEOUT: Duration = Duration::from_secs(6);
const ADVERTISE_INTERVAL: Duration = Duration::from_secs(20);

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GrantedConfig {
    #[serde(flatten)]
    network: Config,
    #[serde(default)]
    package_protocol: u8,
    #[serde(default)]
    same_account: bool,
}

impl std::ops::Deref for GrantedConfig {
    type Target = Config;
    fn deref(&self) -> &Config {
        &self.network
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Offer {
    request_id: Option<String>,
    artifact: String,
    config: GrantedConfig,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Offers {
    request_id: String,
    artifact: String,
    configs: Vec<GrantedConfig>,
}

pub(super) enum Request {
    Find {
        artifact: String,
        reply: oneshot::Sender<Result<Vec<Lease>>>,
    },
    Finish(String),
    Failed(String),
}

struct Pending {
    artifact: String,
    reply: oneshot::Sender<Result<Vec<Lease>>>,
    started: Instant,
}

/// Dropping a download, including on timeout, immediately closes its native network.
pub(super) struct Lease {
    pub connection: Arc<Connection>,
    id: String,
    sender: mpsc::Sender<Request>,
    pub protocol: u8,
}

impl Lease {
    #[cfg(test)]
    pub(super) fn new(config: Config, sender: mpsc::Sender<Request>) -> Result<Self> {
        Self::granted(
            GrantedConfig {
                network: config,
                package_protocol: 0,
                same_account: true,
            },
            sender,
        )
    }

    #[cfg(test)]
    pub(super) fn binary(config: Config, sender: mpsc::Sender<Request>) -> Result<Self> {
        Self::granted(
            GrantedConfig {
                network: config,
                package_protocol: 2,
                same_account: true,
            },
            sender,
        )
    }

    fn granted(config: GrantedConfig, sender: mpsc::Sender<Request>) -> Result<Self> {
        let id = config.session_id.clone();
        let protocol = config.package_protocol;
        let connection = if protocol >= 2 {
            Connection::start_with_packets(config.network)?
        } else {
            Connection::start(config.network)?
        };
        Ok(Self {
            connection,
            id,
            sender,
            protocol,
        })
    }

    pub fn failed(&self) {
        self.connection.close();
        let _queued = self.sender.try_send(Request::Failed(self.id.clone()));
    }
}

impl Drop for Lease {
    fn drop(&mut self) {
        self.connection.close();
        // A disconnected/full signaling queue is harmless: the peer also has an idle deadline.
        let _queued = self.sender.try_send(Request::Finish(self.id.clone()));
    }
}

impl Service {
    pub(super) async fn find_peers(&self, artifact: &str) -> Result<Vec<Lease>> {
        if !self.policy.allows_download() {
            return Err(Error::Unavailable);
        }
        let sender = self.broker.borrow().clone().ok_or(Error::Unavailable)?;
        let (reply, response) = oneshot::channel();
        sender
            .try_send(Request::Find {
                artifact: artifact.into(),
                reply,
            })
            .map_err(|_| Error::Unavailable)?;
        tokio::time::timeout(LOOKUP_TIMEOUT, response)
            .await
            .map_err(|_| Error::Unavailable)?
            .map_err(|_| Error::Unavailable)?
    }
}

pub(crate) struct Bridge {
    service: Arc<Service>,
    sender: mpsc::Sender<Request>,
    receiver: mpsc::Receiver<Request>,
    pending: HashMap<String, Pending>,
    active: HashMap<String, Arc<Connection>>,
    workers: HashMap<String, tauri::async_runtime::JoinHandle<()>>,
    last_advertise: Option<Instant>,
    last_artifacts: Vec<String>,
    last_scope: super::policy::SharingScope,
}

impl Bridge {
    pub fn server(&self, websocket_url: &str) {
        let base = super::mirror::base_from_socket(websocket_url);
        self.service.policy.select_server(base.clone());
        self.service.mirror_base.send_if_modified(|current| {
            if *current == base {
                return false;
            }
            *current = base;
            true
        });
    }

    pub fn new<R: Runtime>(app: &tauri::AppHandle<R>) -> Self {
        let service = app.state::<Arc<Service>>().inner().clone();
        let (sender, receiver) = mpsc::channel(32);
        Self {
            last_scope: service.policy.preferences().scope,
            service,
            sender,
            receiver,
            pending: HashMap::new(),
            active: HashMap::new(),
            workers: HashMap::new(),
            last_advertise: None,
            last_artifacts: Vec::new(),
        }
    }

    pub fn responses(&mut self) -> Vec<Value> {
        let mut messages = Vec::new();
        let scope = self.service.policy.preferences().scope;
        if scope != self.last_scope {
            self.shutdown();
            self.last_scope = scope;
            self.last_advertise = None;
        }
        self.pending.retain(|_, pending| {
            !pending.reply.is_closed() && pending.started.elapsed() < LOOKUP_TIMEOUT
        });
        self.active.retain(|_, connection| !connection.is_closed());
        self.workers.retain(|id, worker| {
            if !self.active.contains_key(id) {
                worker.abort();
                return false;
            }
            true
        });
        while let Ok(request) = self.receiver.try_recv() {
            if let Some(message) = self.request(request) {
                messages.push(message);
            }
        }
        let mut artifacts: Vec<_> = self
            .service
            .cache
            .artifacts()
            .into_iter()
            .map(|artifact| artifact.id)
            .collect();
        if !self.service.policy.allows_upload() {
            artifacts.clear();
        }
        if self.service.policy.preferences().scope == super::policy::SharingScope::Off {
            self.shutdown();
        } else if self.service.broker.borrow().is_none() {
            self.connected();
        }
        if artifacts != self.last_artifacts
            || self
                .last_advertise
                .is_none_or(|last| last.elapsed() >= ADVERTISE_INTERVAL)
        {
            messages.push(
                json!({"type":"update-peer-advertise", "artifacts":artifacts, "ranges":true,
                    "packageProtocol":2,
                    "ownOnly":self.service.policy.preferences().scope == super::policy::SharingScope::Own}),
            );
            self.last_artifacts = artifacts;
            self.last_advertise = Some(Instant::now());
        }
        messages
    }

    fn request(&mut self, request: Request) -> Option<Value> {
        match request {
            Request::Find { artifact, reply } if !reply.is_closed() && self.pending.is_empty() => {
                let id = uuid::Uuid::new_v4().to_string();
                let message = json!({"type":"update-peer-find", "requestId":id,
                    "artifact":artifact, "maxPeers":MAX_DOWNLOAD_PEERS, "packageProtocol":2, "refill":true,
                    "ownOnly":self.service.policy.preferences().scope == super::policy::SharingScope::Own});
                self.pending.insert(
                    id,
                    Pending {
                        artifact,
                        reply,
                        started: Instant::now(),
                    },
                );
                Some(message)
            }
            Request::Finish(id) => {
                self.cancel(&id);
                Some(json!({"type":"update-peer-done", "sessionId":id}))
            }
            Request::Failed(id) => {
                self.cancel(&id);
                Some(json!({"type":"update-peer-done", "sessionId":id, "failed":true}))
            }
            _ => None,
        }
    }

    pub fn unavailable(&mut self, request: &str) {
        self.pending.remove(request);
    }

    pub fn cancel(&mut self, id: &str) {
        if let Some(connection) = self.active.remove(id) {
            connection.close();
        }
        if let Some(worker) = self.workers.remove(id) {
            worker.abort();
        }
    }

    pub fn offer(&mut self, offer: Offer) {
        let id = offer.config.session_id.clone();
        if tauri::async_runtime::block_on(async { self.accept(offer) }).is_err() {
            // No connection was accepted; release the server's short-lived reservation.
            let _queued = self.sender.try_send(Request::Finish(id));
        }
    }

    pub fn offers(&mut self, offers: Offers) {
        let result = tauri::async_runtime::block_on(async { self.accept_many(&offers) });
        if result.is_err() {
            for config in offers.configs {
                let _queued = self
                    .sender
                    .try_send(Request::Finish(config.session_id.clone()));
            }
        }
    }

    fn accept_many(&mut self, offers: &Offers) -> Result<()> {
        let pending = self
            .pending
            .remove(&offers.request_id)
            .ok_or(Error::Unavailable)?;
        if pending.artifact != offers.artifact
            || pending.reply.is_closed()
            || offers.configs.is_empty()
            || offers.configs.len() > MAX_DOWNLOAD_PEERS
        {
            return Err(Error::Invalid);
        }
        let mut leases = Vec::new();
        for config in &offers.configs {
            config.validate()?;
            if self.service.policy.preferences().scope == super::policy::SharingScope::Own
                && !config.same_account
            {
                return Err(Error::Unavailable);
            }
            if config.desktop
                || !config.session_id.starts_with("update-")
                || self.active.contains_key(&config.session_id)
            {
                return Err(Error::Invalid);
            }
            let lease = Lease::granted(config.clone(), self.sender.clone())?;
            self.active
                .insert(config.session_id.clone(), lease.connection.clone());
            leases.push(lease);
        }
        pending
            .reply
            .send(Ok(leases))
            .map_err(|_| Error::Unavailable)
    }

    fn accept(&mut self, offer: Offer) -> Result<()> {
        if self.service.policy.preferences().scope == super::policy::SharingScope::Own
            && !offer.config.same_account
        {
            return Err(Error::Unavailable);
        }
        if !cache::valid_id(&offer.artifact)
            || !offer.config.session_id.starts_with("update-")
            || self.active.contains_key(&offer.config.session_id)
        {
            return Err(Error::Invalid);
        }
        offer.config.validate()?;
        if offer.config.desktop {
            return self.seed(offer);
        }
        let pending = self
            .pending
            .remove(offer.request_id.as_deref().ok_or(Error::Invalid)?)
            .ok_or(Error::Unavailable)?;
        if pending.artifact != offer.artifact || pending.reply.is_closed() {
            return Err(Error::Invalid);
        }
        let id = offer.config.session_id.clone();
        let lease = Lease::granted(offer.config, self.sender.clone())?;
        self.active.insert(id, lease.connection.clone());
        pending
            .reply
            .send(Ok(vec![lease]))
            .map_err(|_| Error::Unavailable)
    }

    fn seed(&mut self, offer: Offer) -> Result<()> {
        if !self.service.policy.allows_upload() {
            return Err(Error::Unavailable);
        }
        if !self
            .service
            .cache
            .artifacts()
            .iter()
            .any(|artifact| artifact.id == offer.artifact)
        {
            return Err(Error::Unavailable);
        }
        let permit = self
            .service
            .uploads
            .clone()
            .try_acquire_owned()
            .map_err(|_| Error::Unavailable)?;
        let id = offer.config.session_id.clone();
        let protocol = offer.config.package_protocol;
        let connection = if protocol >= 2 {
            Connection::start_with_packets(offer.config.network)?
        } else {
            Connection::start(offer.config.network)?
        };
        self.active.insert(id.clone(), connection.clone());
        let cache = self.service.cache.clone();
        let sender = self.sender.clone();
        let policy = self.service.policy.clone();
        let scope = policy.preferences().scope;
        self.workers.insert(
            id.clone(),
            tauri::async_runtime::spawn(async move {
                let _permit = permit;
                let lease = Lease {
                    connection,
                    id,
                    sender,
                    protocol,
                };
                // Failure is an expected fallback condition; never expose peer endpoints or grants in logs.
                let transfer = async {
                    if protocol >= 2 {
                        let snapshot = cache.snapshot(&offer.artifact)?;
                        super::block_protocol::seed(
                            &lease.connection,
                            snapshot,
                            &offer.artifact,
                            &policy,
                        )
                        .await
                    } else {
                        transfer::seed_with_policy(
                            &lease.connection,
                            &cache,
                            &offer.artifact,
                            &policy,
                        )
                        .await
                    }
                };
                let _result = tokio::select! {
                    result = tokio::time::timeout(TRANSFER_LIFETIME, transfer) => result,
                    _ = policy.scope_changed(scope) => Ok(Err(Error::Unavailable)),
                };
            }),
        );
        Ok(())
    }

    pub fn connected(&mut self) {
        self.service.broker.send_replace(Some(self.sender.clone()));
        self.last_advertise = None;
    }

    pub fn disconnected(&mut self) {
        self.service.broker.send_replace(None);
        self.pending.clear();
        // Native transfers keep their original short-lived grants through signaling reconnects.
    }

    pub fn signed_out(&mut self) {
        self.service.policy.select_server(None);
        self.service.mirror_base.send_replace(None);
        self.shutdown();
    }

    pub fn shutdown(&mut self) {
        self.disconnected();
        for connection in self.active.values() {
            connection.close();
        }
        for (_, worker) in self.workers.drain() {
            worker.abort();
        }
        self.active.clear();
    }
}

impl Drop for Bridge {
    fn drop(&mut self) {
        self.signed_out();
    }
}

#[cfg(test)]
#[path = "signaling_policy_tests.rs"]
mod policy_tests;
