//! Completion markers are protocol-specific; EOF and Chat's [DONE] cannot complete Responses.
use serde_json::Value;

#[derive(Default, PartialEq, Eq)]
enum StreamProtocol {
    #[default]
    Unknown,
    Responses,
    Chat,
}

#[derive(Default)]
pub(super) struct StreamCompletion {
    protocol: StreamProtocol,
    completed: bool,
    unverified: bool,
}

pub(super) struct CompletionEvent<'a> {
    pub(super) name: &'a str,
    pub(super) data: &'a str,
    pub(super) value: Option<&'a Value>,
    pub(super) truncated: bool,
}

impl StreamCompletion {
    pub(super) fn require_responses(&mut self) {
        if self.protocol != StreamProtocol::Responses {
            self.completed = false;
        }
        self.protocol = StreamProtocol::Responses;
    }

    pub(super) fn seen(&self) -> bool {
        self.completed
    }

    pub(super) fn unverified(&self) -> bool {
        self.unverified && !self.completed
    }

    pub(super) fn complete(&mut self) {
        self.completed = true;
    }

    pub(super) fn observe(&mut self, event: CompletionEvent<'_>) {
        let kind = event
            .value
            .and_then(|value| value.get("type"))
            .and_then(Value::as_str)
            .or_else(|| {
                event
                    .truncated
                    .then(|| partial_event_type(event.data))
                    .flatten()
            });
        if event.name.starts_with("response.")
            || kind.is_some_and(|kind| kind.starts_with("response."))
        {
            self.require_responses();
        }
        let may_complete = kind
            .map(terminal_event)
            .unwrap_or_else(|| matches!(event.name, "" | "message") || terminal_event(event.name));
        if event.truncated && may_complete {
            // The bounded observer cannot validate the omitted suffix. Do not mark a member
            // successful or unhealthy solely because diagnostics truncated a large terminal frame.
            self.unverified = true;
            return;
        }
        if event.data.trim() == "[DONE]" {
            self.completed |= self.protocol == StreamProtocol::Chat;
            return;
        }
        let Some(value) = event.value.filter(|value| value.is_object()) else {
            return;
        };
        if self.protocol == StreamProtocol::Responses {
            self.completed |= kind == Some("response.completed") && valid_response(value);
            return;
        }
        if value.get("choices").is_some_and(Value::is_array) {
            self.protocol = StreamProtocol::Chat;
        }
        self.completed |= terminal_event(kind.unwrap_or(event.name)) || chat_finished(value);
    }
}

/// Read only a top-level type when the bounded capture ends inside a large payload.
/// This hint never establishes successful JSON validation.
fn partial_event_type(data: &str) -> Option<&str> {
    use serde::de::{IgnoredAny, MapAccess, Visitor};
    use serde::Deserializer;
    struct EventType<'hint, 'de>(&'hint mut Option<&'de str>);
    impl<'de> Visitor<'de> for EventType<'_, 'de> {
        type Value = ();

        fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
            formatter.write_str("an event object")
        }

        fn visit_map<M: MapAccess<'de>>(self, mut map: M) -> Result<Self::Value, M::Error> {
            while let Some(key) = map.next_key::<&str>()? {
                if key == "type" {
                    *self.0 = Some(map.next_value()?);
                    return Ok(());
                }
                map.next_value::<IgnoredAny>()?;
            }
            Ok(())
        }
    }
    let mut kind = None;
    // The deserializer may reject the unconsumed suffix after the visitor returns early.
    // Intentionally ignore that error: this is only a hint from an already truncated frame.
    let _ = serde_json::Deserializer::from_str(data).deserialize_map(EventType(&mut kind));
    kind
}

fn valid_response(value: &Value) -> bool {
    let Some(response) = value.get("response").filter(|value| value.is_object()) else {
        return false;
    };
    response.get("id").is_some_and(Value::is_string)
        && response
            .get("status")
            .is_none_or(|status| status == "completed")
        && response.get("error").is_none_or(Value::is_null)
}

fn terminal_event(kind: &str) -> bool {
    matches!(
        kind,
        "response.completed"
            | "message_stop"
            | "image_generation.completed"
            | "image_edit.completed"
    )
}

fn chat_finished(value: &Value) -> bool {
    value
        .get("choices")
        .and_then(Value::as_array)
        .is_some_and(|choices| {
            choices.iter().any(|choice| {
                choice
                    .get("finish_reason")
                    .and_then(Value::as_str)
                    .is_some_and(|reason| !reason.is_empty())
            })
        })
}
