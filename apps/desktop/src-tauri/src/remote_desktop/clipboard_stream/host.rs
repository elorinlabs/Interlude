use super::{ClipboardError, ClipboardResult, Offer, ReadRequest, Sender};
use crate::remote_desktop::{clipboard::ReplyData, Session};
use serde::Deserialize;

#[derive(Deserialize)]
#[serde(tag = "action", rename_all = "camelCase")]
pub(crate) enum Request {
    Publish {
        offer: Offer,
        paste: bool,
        #[serde(rename = "expectedRevision")]
        expected_revision: Option<String>,
    },
    Chunk {
        request: ReadRequest,
    },
    Reply {
        #[serde(rename = "requestId")]
        request_id: String,
        data: Option<String>,
    },
    Release,
}

pub(crate) fn apply(
    session: &mut Session,
    request: Request,
    send: Sender,
) -> ClipboardResult<ReplyData> {
    use base64::{engine::general_purpose::STANDARD, Engine};
    authorize(&session.permissions, &request)?;
    let scope = format!("host:{}", session.id);
    match request {
        Request::Publish {
            offer,
            paste,
            expected_revision,
        } => {
            if expected_revision.is_some()
                && expected_revision != crate::remote_desktop::clipboard_revision::current().ok()
            {
                return if paste {
                    crate::remote_desktop::clipboard::paste_original(session)
                } else {
                    Err(ClipboardError::Invalid)
                };
            }
            let reader = super::remote_reader(scope.clone(), send);
            super::publish(scope, offer, reader)?;
            session.clipboard_revision = crate::remote_desktop::clipboard_revision::current().ok();
            if paste {
                crate::remote_desktop::clipboard_platform::paste_selection(session)?;
            }
        }
        Request::Chunk { request } => {
            let mut reply = ReplyData::default();
            reply.data = Some(STANDARD.encode(super::read(&scope, &request)?));
            return Ok(reply);
        }
        Request::Reply { request_id, data } => {
            super::answer(&scope, request_id, data)?;
        }
        Request::Release => super::release(&scope),
    }
    Ok(ReplyData::default())
}

pub(super) fn authorize(
    policy: &crate::remote_desktop::permissions::Permissions,
    request: &Request,
) -> ClipboardResult<()> {
    let allowed = match request {
        Request::Publish { paste, .. } => {
            policy.files && policy.clipboard_write && (!paste || policy.control)
        }
        Request::Chunk { .. } => policy.files && policy.clipboard_read,
        Request::Reply { .. } => policy.files && policy.clipboard_write,
        Request::Release => true,
    };
    if allowed {
        Ok(())
    } else {
        Err(ClipboardError::Denied)
    }
}
