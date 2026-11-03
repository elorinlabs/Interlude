//! Preserve the engine's estimate independently from API billing counters.
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Clone, Debug, Deserialize, Serialize)]
pub(super) struct Estimate {
    pub(super) thread_id: Option<String>,
    pub(super) turn_id: String,
    pub(super) tokens: u64,
    pub(super) timestamp: DateTime<Utc>,
}

/// Accept only the engine's compaction decision, never tokens found in arbitrary tool output.
pub(super) fn parse(line: &str) -> Option<Estimate> {
    let value: Value = serde_json::from_str(line).ok()?;
    let target = value["target"].as_str()?;
    if !matches!(target, "codex_core::session::turn" | "codex_core::codex")
        || value["fields"]["message"] != "post sampling token usage"
    {
        return None;
    }
    let fields = &value["fields"];
    let thread_id = value["spans"]
        .as_array()
        .into_iter()
        .flatten()
        .rev()
        .find_map(|span| {
            span["thread_id"]
                .as_str()
                .or_else(|| span["thread.id"].as_str())
        });
    if let Some(id) = thread_id {
        super::valid_id(id).then_some(())?;
    }
    Some(Estimate {
        thread_id: thread_id.map(str::to_owned),
        turn_id: fields["turn_id"].as_str()?.to_owned(),
        tokens: fields["total_usage_tokens"].as_u64()?,
        timestamp: DateTime::parse_from_rfc3339(value["timestamp"].as_str()?)
            .ok()?
            .with_timezone(&Utc),
    })
}

/// A persisted API baseline and a separately timestamped engine estimate; resets reject late stderr.
#[derive(Clone, Default, Deserialize, Serialize)]
pub(in crate::codex_gui::client) struct Snapshot {
    pub(super) usage: Option<Value>,
    turn_id: Option<String>,
    estimate: Option<Estimate>,
    not_before: Option<DateTime<Utc>>,
    #[serde(skip)]
    pub(super) restored: bool,
}

impl Snapshot {
    pub(super) fn usage(&self) -> Option<Value> {
        let mut usage = self.usage.clone()?;
        if let Some(estimate) = &self.estimate {
            usage
                .as_object_mut()?
                .insert("contextTokens".into(), estimate.tokens.into());
        }
        Some(usage)
    }

    pub(super) fn start(&mut self, turn_id: Option<&str>) {
        self.turn_id = turn_id.map(str::to_owned);
    }

    pub(super) fn turn_id(&self) -> Option<&str> {
        self.turn_id.as_deref()
    }

    pub(super) fn update(&mut self, usage: &Value, turn_id: Option<&str>, now: DateTime<Utc>) {
        let changed_history = self.usage.as_ref().is_some_and(|previous| {
            counter(usage, "total") < counter(previous, "total")
                || (self.restored
                    && (usage["total"] != previous["total"] || usage["last"] != previous["last"]))
        });
        if changed_history {
            self.reset(now);
        }
        self.restored = false;
        self.usage = Some(usage.clone());
        if turn_id.is_some() {
            self.start(turn_id);
        }
    }

    pub(super) fn estimate(&mut self, estimate: Estimate) -> bool {
        if self
            .turn_id
            .as_ref()
            .is_some_and(|id| *id != estimate.turn_id)
            || self
                .not_before
                .is_some_and(|time| estimate.timestamp <= time)
            || self
                .estimate
                .as_ref()
                .is_some_and(|old| estimate.timestamp <= old.timestamp)
        {
            return false;
        }
        self.restored = false;
        self.estimate = Some(estimate);
        true
    }

    pub(super) fn reset(&mut self, now: DateTime<Utc>) {
        self.estimate = None;
        self.not_before = Some(now);
        if let Some(usage) = self.usage.as_mut().and_then(Value::as_object_mut) {
            usage.remove("contextTokens");
        }
    }

    pub(super) fn clear(&mut self, now: DateTime<Utc>) {
        self.reset(now);
        self.usage = None;
    }
}

fn counter(usage: &Value, kind: &str) -> Option<u64> {
    usage[kind]["totalTokens"].as_u64()
}
