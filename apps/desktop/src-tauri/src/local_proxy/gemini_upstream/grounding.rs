use serde_json::{json, Value};

#[derive(Default)]
pub(super) struct Grounding {
    chunks: Vec<Value>,
    supports: Vec<Value>,
    citations: Vec<Value>,
}

impl Grounding {
    pub(super) fn observe(&mut self, candidate: &Value) {
        let grounding = &candidate["groundingMetadata"];
        self.chunks.extend(
            grounding["groundingChunks"]
                .as_array()
                .into_iter()
                .flatten()
                .cloned(),
        );
        self.supports.extend(
            grounding["groundingSupports"]
                .as_array()
                .into_iter()
                .flatten()
                .cloned(),
        );
        self.citations.extend(
            candidate["citationMetadata"]["citationSources"]
                .as_array()
                .into_iter()
                .flatten()
                .cloned(),
        );
    }

    pub(super) fn annotations(&self, parts: &[Value]) -> Vec<Value> {
        let text = parts
            .iter()
            .filter(|part| part["thought"] != true)
            .filter_map(|part| part["text"].as_str())
            .collect::<String>();
        let mut annotations = Vec::new();
        for support in &self.supports {
            let Some(range) = segment_range(&support["segment"], parts, &text) else {
                continue;
            };
            for index in support["groundingChunkIndices"]
                .as_array()
                .into_iter()
                .flatten()
            {
                let Some(chunk) = index
                    .as_u64()
                    .and_then(|index| self.chunks.get(index as usize))
                else {
                    continue;
                };
                if let Some(annotation) = citation(&chunk["web"], range, &text) {
                    annotations.push(annotation);
                }
            }
        }
        for source in &self.citations {
            if let Some(range) = byte_range(source, &text) {
                if let Some(annotation) = citation(source, range, &text) {
                    annotations.push(annotation);
                }
            }
        }
        let mut unique = Vec::new();
        for annotation in annotations {
            if !unique.contains(&annotation) {
                unique.push(annotation);
            }
        }
        unique
    }
}

fn segment_range(segment: &Value, parts: &[Value], text: &str) -> Option<(usize, usize)> {
    let expected = segment["text"].as_str();
    if let Some(range) = byte_range(segment, text).filter(|(start, end)| {
        segment["partIndex"].as_u64().unwrap_or(0) == 0 && expected == text.get(*start..*end)
    }) {
        return Some(range);
    }
    let index = segment["partIndex"].as_u64().unwrap_or(0) as usize;
    if let Some(part) = parts.get(index).filter(|part| part["thought"] != true) {
        if let Some(range) = part["text"]
            .as_str()
            .and_then(|part| byte_range(segment, part))
        {
            let offset = parts[..index]
                .iter()
                .filter(|part| part["thought"] != true)
                .filter_map(|part| part["text"].as_str())
                .map(str::len)
                .sum::<usize>();
            let range = (offset + range.0, offset + range.1);
            if expected.is_none_or(|expected| text.get(range.0..range.1) == Some(expected)) {
                return Some(range);
            }
        }
    }
    let expected = expected.filter(|text| !text.is_empty())?;
    let mut matches = text.match_indices(expected);
    let (start, _) = matches.next()?;
    matches
        .next()
        .is_none()
        .then_some((start, start + expected.len()))
}

fn byte_range(source: &Value, text: &str) -> Option<(usize, usize)> {
    let start = source["startIndex"].as_u64().unwrap_or(0) as usize;
    let end = source["endIndex"].as_u64()? as usize;
    (start < end && text.get(start..end).is_some()).then_some((start, end))
}

fn citation(source: &Value, (start, end): (usize, usize), text: &str) -> Option<Value> {
    let uri = source["uri"].as_str()?;
    let url = ::url::Url::parse(uri).ok()?;
    if !matches!(url.scheme(), "http" | "https") || url.host_str().is_none() {
        return None;
    }
    Some(
        json!({"type":"url_citation","url":uri,"title":source["title"].as_str().unwrap_or(uri),
        "start_index":text[..start].chars().count(),"end_index":text[..end].chars().count()}),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn grounding_joins_streamed_chunks_and_converts_utf8_offsets() {
        let mut grounding = Grounding::default();
        grounding.observe(&json!({"groundingMetadata":{"groundingChunks":[{"web":{"uri":"https://example.com","title":"Source"}}]}}));
        grounding.observe(&json!({"groundingMetadata":{"groundingSupports":[{
            "segment":{"startIndex":3,"endIndex":9,"text":"天气"},"groundingChunkIndices":[0]
        }]}}));
        let annotations = grounding.annotations(&[json!({"text":"今"}), json!({"text":"天气好"})]);
        assert_eq!(annotations[0]["start_index"], 1);
        assert_eq!(annotations[0]["end_index"], 3);
        assert_eq!(annotations[0]["url"], "https://example.com");
    }

    #[test]
    fn grounding_rejects_invalid_links_and_unlocated_segments() {
        let mut grounding = Grounding::default();
        grounding.observe(&json!({"citationMetadata":{"citationSources":[
            {"uri":"javascript:alert(1)","startIndex":0,"endIndex":2},
            {"uri":"https://example.com","startIndex":0,"endIndex":50}
        ]}}));
        assert!(grounding.annotations(&[json!({"text":"Hi"})]).is_empty());
    }
}
