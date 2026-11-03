//! Bounded model discovery; pagination cursors never choose a new upstream URL.

use super::{parse_model_page, MODEL_QUERY_TIMEOUT};
use crate::models::{ProviderApiFormat, ProviderRequestOptions};
use reqwest::blocking::{Client, Response};
use serde_json::Value;
use std::{collections::HashSet, io::Read, time::Instant};
use url::Url;

const MAX_PAGES: usize = 10;
const MAX_PAGE_BYTES: u64 = 1024 * 1024;
const MAX_TOTAL_BYTES: usize = 4 * 1024 * 1024;
const MAX_CURSOR_BYTES: usize = 4096;

pub(super) struct Query<'a> {
    pub(super) url: Url,
    pub(super) api_key: &'a str,
    pub(super) format: ProviderApiFormat,
    pub(super) options: Option<&'a ProviderRequestOptions>,
}

pub(super) fn fetch(client: &Client, query: Query<'_>) -> Result<Vec<String>, String> {
    let started = Instant::now();
    let mut url = query.url.clone();
    let mut cursors = HashSet::new();
    let mut bytes_read = 0;
    let mut models = Vec::new();
    let mut seen_models = HashSet::new();
    let cursor_field = cursor_field(query.format);
    if let Some(field) = cursor_field {
        cursors.extend(
            url.query_pairs()
                .filter(|(key, _)| key == field)
                .map(|(_, value)| value.into_owned()),
        );
    }
    for page in 0..MAX_PAGES {
        let remaining = MODEL_QUERY_TIMEOUT.saturating_sub(started.elapsed());
        if remaining.is_zero() {
            return Err("Loading models took too long. Please try again".into());
        }
        let request = crate::provider_discovery::apply_headers(
            client.get(url.clone()),
            query.api_key,
            query.format,
            query.options,
        )?
        .timeout(remaining);
        let response = request
            .send()
            .map_err(|_| "Could not connect to the model service")?;
        let payload = read_page(response, &mut bytes_read)?;
        for model in parse_model_page(&payload)? {
            if seen_models.insert(model.clone()) {
                models.push(model);
            }
        }
        let Some(cursor) = next_cursor(&payload, query.format)? else {
            return finish(models);
        };
        if !cursors.insert(cursor.clone()) {
            return Err("The model service repeated a page".into());
        }
        if page + 1 == MAX_PAGES {
            return Err("The model list has too many pages".into());
        }
        let field = cursor_field.ok_or("The model service returned an unsupported page cursor")?;
        url = page_url(&query.url, field, &cursor);
    }
    Err("The model list has too many pages".into())
}

fn finish(models: Vec<String>) -> Result<Vec<String>, String> {
    if models.is_empty() {
        Err("The service did not return any available models".into())
    } else {
        Ok(models)
    }
}

fn cursor_field(format: ProviderApiFormat) -> Option<&'static str> {
    match format {
        ProviderApiFormat::GeminiGenerateContent => Some("pageToken"),
        ProviderApiFormat::AnthropicMessages => Some("after_id"),
        _ => None,
    }
}

fn next_cursor(payload: &Value, format: ProviderApiFormat) -> Result<Option<String>, String> {
    let value = match format {
        ProviderApiFormat::GeminiGenerateContent => payload.get("nextPageToken"),
        ProviderApiFormat::AnthropicMessages => {
            match payload.get("has_more") {
                None | Some(Value::Bool(false)) => return Ok(None),
                Some(Value::Bool(true)) => {}
                _ => return Err("The model service returned an invalid page cursor".into()),
            }
            Some(
                payload
                    .get("last_id")
                    .ok_or("The model service omitted its next page cursor")?,
            )
        }
        _ => return Ok(None),
    };
    let Some(value) = value else {
        return Ok(None);
    };
    if value.is_null() && format == ProviderApiFormat::GeminiGenerateContent {
        return Ok(None);
    }
    let cursor = value
        .as_str()
        .ok_or("The model service returned an invalid page cursor")?;
    if cursor.is_empty() && format == ProviderApiFormat::GeminiGenerateContent {
        return Ok(None);
    }
    if cursor.is_empty() || cursor.len() > MAX_CURSOR_BYTES {
        return Err("The model service returned an invalid page cursor".into());
    }
    Ok(Some(cursor.to_string()))
}

fn page_url(base: &Url, field: &str, cursor: &str) -> Url {
    let mut url = base.clone();
    let pairs = base
        .query_pairs()
        .filter(|(key, _)| key != field)
        .map(|(key, value)| (key.into_owned(), value.into_owned()))
        .collect::<Vec<_>>();
    url.set_query(None);
    url.query_pairs_mut()
        .extend_pairs(pairs)
        .append_pair(field, cursor);
    url
}

fn read_page(response: Response, total: &mut usize) -> Result<Value, String> {
    if !response.status().is_success() {
        return Err(format!(
            "Model discovery returned HTTP {}",
            response.status().as_u16()
        ));
    }
    if response
        .content_length()
        .is_some_and(|bytes| bytes > MAX_PAGE_BYTES)
    {
        return Err("The model list is too large".into());
    }
    let mut bytes = Vec::new();
    response
        .take(MAX_PAGE_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "The model list could not be read")?;
    *total = total.saturating_add(bytes.len());
    if bytes.len() as u64 > MAX_PAGE_BYTES || *total > MAX_TOTAL_BYTES {
        return Err("The model list is too large".into());
    }
    serde_json::from_slice(&bytes)
        .map_err(|_| "The service returned an unreadable model list".into())
}

#[cfg(test)]
#[path = "provider_model_pages_tests.rs"]
mod tests;
