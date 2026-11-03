const OPENING_TAGS: [(&str, &str); 2] = [("<think>", "</think>"), ("<thinking>", "</thinking>")];
const MAX_LEADING_WHITESPACE_BYTES: usize = 256;

#[derive(Default)]
enum Phase {
    #[default]
    Start,
    Reasoning(&'static str),
    Text,
}

#[derive(Default)]
pub(super) struct InlineReasoning {
    phase: Phase,
    pending: String,
}

#[derive(Debug, Default, PartialEq, Eq)]
pub(super) struct SplitText {
    pub(super) reasoning: String,
    pub(super) text: String,
}

impl InlineReasoning {
    /// Recognize a single leading reasoning block while preserving later literal markup.
    pub(super) fn push(&mut self, text: &str) -> SplitText {
        self.pending.push_str(text);
        if matches!(self.phase, Phase::Start) && !self.resolve_start() {
            return SplitText::default();
        }
        match self.phase {
            Phase::Reasoning(closing) => self.take_reasoning(closing),
            Phase::Text => SplitText {
                text: std::mem::take(&mut self.pending),
                ..SplitText::default()
            },
            Phase::Start => SplitText::default(),
        }
    }

    /// Flush an unfinished tag as text, or unfinished reasoning as reasoning, even on errors.
    pub(super) fn finish(&mut self) -> SplitText {
        let pending = std::mem::take(&mut self.pending);
        let output = if matches!(self.phase, Phase::Reasoning(_)) {
            SplitText {
                reasoning: pending,
                ..SplitText::default()
            }
        } else {
            SplitText {
                text: pending,
                ..SplitText::default()
            }
        };
        self.phase = Phase::Text;
        output
    }

    fn resolve_start(&mut self) -> bool {
        let candidate = self.pending.trim_start();
        let whitespace_len = self.pending.len() - candidate.len();
        if whitespace_len <= MAX_LEADING_WHITESPACE_BYTES {
            for (opening, closing) in OPENING_TAGS {
                if candidate.starts_with(opening) {
                    self.pending.drain(..whitespace_len + opening.len());
                    self.phase = Phase::Reasoning(closing);
                    return true;
                }
            }
            if OPENING_TAGS
                .iter()
                .any(|(opening, _)| opening.starts_with(candidate))
            {
                return false;
            }
        }
        self.phase = Phase::Text;
        true
    }

    fn take_reasoning(&mut self, closing: &str) -> SplitText {
        if let Some(index) = self.pending.find(closing) {
            let reasoning = self.pending[..index].to_string();
            let text = self.pending[index + closing.len()..].to_string();
            self.pending.clear();
            self.phase = Phase::Text;
            return SplitText { reasoning, text };
        }
        // Only a suffix matching part of the delimiter must wait for the next chunk.
        let held = (1..closing.len())
            .rev()
            .find(|length| self.pending.ends_with(&closing[..*length]))
            .unwrap_or(0);
        let ready = self.pending.len() - held;
        let reasoning = self.pending.drain(..ready).collect();
        SplitText {
            reasoning,
            ..SplitText::default()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn split(parts: &[&str]) -> SplitText {
        let mut parser = InlineReasoning::default();
        let mut result = SplitText::default();
        for part in parts.iter().map(|part| parser.push(part)) {
            result.reasoning.push_str(&part.reasoning);
            result.text.push_str(&part.text);
        }
        let tail = parser.finish();
        result.reasoning.push_str(&tail.reasoning);
        result.text.push_str(&tail.text);
        result
    }

    #[test]
    fn leading_reasoning_handles_every_unicode_safe_chunk_boundary() {
        let source = "\n<thinking>先看问题</thinking>答案<think>literal</think>";
        for (index, _) in source.char_indices() {
            assert_eq!(
                split(&[&source[..index], &source[index..]]),
                SplitText {
                    reasoning: "先看问题".into(),
                    text: "答案<think>literal</think>".into(),
                }
            );
        }
        assert_eq!(split(&["<", "think", ">x</thi", "nk>y"]).reasoning, "x");
    }

    #[test]
    fn ordinary_markup_and_incomplete_openers_are_preserved() {
        for text in [
            "explain <think>this</think>",
            "```<think>code</think>```",
            "<thi",
            "<thinkingx>no",
        ] {
            assert_eq!(
                split(&[text]),
                SplitText {
                    text: text.into(),
                    ..SplitText::default()
                }
            );
        }
        assert_eq!(
            split(&["<think>unfinished</thi"]).reasoning,
            "unfinished</thi"
        );
        assert_eq!(split(&["<think></think>answer"]).text, "answer");
    }
}
