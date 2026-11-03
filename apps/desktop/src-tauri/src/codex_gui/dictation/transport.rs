use super::{
    account::{self, Account, Credentials},
    audio::Audio,
    error::{Error, Result},
};
use reqwest::{multipart, Client, StatusCode, Url};
use serde::Deserialize;
use std::time::Duration;
use tauri::AppHandle;

const ENDPOINT: &str = "https://chatgpt.com/backend-api/transcribe";
const MAX_RESPONSE_BYTES: usize = 64 * 1024;

#[derive(Deserialize)]
struct Transcript {
    text: String,
}

pub(super) fn request(
    client: &Client,
    endpoint: Url,
    auth: &Credentials,
    audio: &Audio,
) -> Result<reqwest::RequestBuilder> {
    let file = multipart::Part::bytes(audio.bytes.clone())
        .file_name(audio.filename)
        .mime_str(audio.mime)
        .map_err(|_| Error::Audio)?;
    Ok(client
        .post(endpoint)
        .bearer_auth(&auth.token)
        .header("ChatGPT-Account-Id", &auth.account_id)
        .header("originator", "codex_desktop")
        .header("User-Agent", "Codex Desktop/26.1013.4894")
        .multipart(multipart::Form::new().part("file", file)))
}

pub(super) fn status_error(status: StatusCode) -> Result<()> {
    match status {
        StatusCode::UNAUTHORIZED => Err(Error::Authentication),
        StatusCode::FORBIDDEN => Err(Error::Forbidden),
        StatusCode::TOO_MANY_REQUESTS => Err(Error::RateLimited),
        StatusCode::PAYLOAD_TOO_LARGE
        | StatusCode::BAD_REQUEST
        | StatusCode::UNSUPPORTED_MEDIA_TYPE => Err(Error::Audio),
        code if code.is_success() => Ok(()),
        _ => Err(Error::Unavailable),
    }
}

pub(super) fn parse(bytes: &[u8]) -> Result<String> {
    let result: Transcript = serde_json::from_slice(bytes).map_err(|_| Error::Unavailable)?;
    let text = result.text.trim();
    if text.is_empty() {
        return Err(Error::Empty);
    }
    Ok(text.to_owned())
}

async fn read(mut response: reqwest::Response) -> Result<String> {
    status_error(response.status())?;
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| Error::Network)? {
        if bytes.len() + chunk.len() > MAX_RESPONSE_BYTES {
            return Err(Error::Unavailable);
        }
        bytes.extend_from_slice(&chunk);
    }
    parse(&bytes)
}

pub(super) async fn transcribe(app: AppHandle, account: Account, audio: Audio) -> Result<String> {
    let endpoint = Url::parse(ENDPOINT).map_err(|_| Error::Unavailable)?;
    let builder = Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(60));
    let client = crate::system_proxy::apply_async(builder, &endpoint)
        .await
        .map_err(|_| Error::Network)?
        .build()
        .map_err(|_| Error::Network)?;
    let mut auth = account::authorize(app.clone(), account.clone(), None).await?;
    let mut response = request(&client, endpoint.clone(), &auth, &audio)?
        .send()
        .await
        .map_err(|_| Error::Network)?;
    // Only an explicit authentication rejection permits an automatic retry.
    if response.status() == StatusCode::UNAUTHORIZED {
        auth = account::authorize(app.clone(), account.clone(), Some(auth.token)).await?;
        response = request(&client, endpoint, &auth, &audio)?
            .send()
            .await
            .map_err(|_| Error::Network)?;
    }
    let text = read(response).await?;
    tauri::async_runtime::spawn_blocking(move || account::check(&app, &account))
        .await
        .map_err(|_| Error::Unavailable)??;
    Ok(text)
}
