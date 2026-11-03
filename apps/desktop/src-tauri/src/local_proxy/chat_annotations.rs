//! Normalize URL citations for buffered and streaming Responses output.
use serde_json::{json, Value};

const MAX_ANNOTATIONS: usize = 1024;

pub(super) fn extract(message: &Value) -> Vec<Value> {
    message["annotations"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|annotation| {
            if annotation["type"] != "url_citation" {
                return None;
            }
            let citation = annotation.get("url_citation").unwrap_or(annotation);
            let url = citation["url"].as_str()?;
            let parsed = ::url::Url::parse(url).ok()?;
            if !matches!(parsed.scheme(), "http" | "https") || parsed.host_str().is_none() {
                return None;
            }
            let start = citation["start_index"].as_u64()?;
            let end = citation["end_index"].as_u64()?;
            if start > end {
                return None;
            }
            Some(json!({"type":"url_citation","url":url,
            "title":citation["title"].as_str().unwrap_or(url),"start_index":start,"end_index":end}))
        })
        .take(MAX_ANNOTATIONS)
        .collect()
}
