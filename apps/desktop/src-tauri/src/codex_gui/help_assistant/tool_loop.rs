use super::{
    tool_output, transport,
    types::{HelpError, Result, MAX_ANSWER_CHARS},
};
use serde_json::{json, Value};
use std::future::Future;

const MAX_TOOL_CALLS: usize = 24;

pub(super) trait Executor {
    fn call(&mut self, name: &str, arguments: Value) -> impl Future<Output = Result<Value>> + Send;
}

pub(super) struct Conversation<'a> {
    pub base_url: &'a str,
    pub revision: u64,
    pub body: Value,
}

pub(super) async fn answer(
    mut conversation: Conversation<'_>,
    executor: &mut impl Executor,
    progress: &mut (impl FnMut(&str) + Send),
) -> Result<String> {
    let mut answer = String::new();
    let mut calls = 0;
    loop {
        if calls >= MAX_TOOL_CALLS {
            conversation.body["tool_choice"] = json!("none");
        }
        let response = transport::response_streaming(
            conversation.base_url,
            conversation.body.clone(),
            conversation.revision,
            &mut |text| progress(&format!("{answer}{text}")),
        )
        .await?;
        append_text(&mut answer, &transport::message_text(&response))?;
        let output = response["output"]
            .as_array()
            .ok_or(HelpError::AnswerFailed)?;
        let actions: Vec<_> = output
            .iter()
            .filter(|item| item["type"] == "function_call")
            .collect();
        if actions.is_empty() {
            return final_answer(answer);
        }
        if calls >= MAX_TOOL_CALLS {
            return Err(HelpError::AnswerFailed);
        }
        tool_output::append(&mut conversation.body, output.clone())?;
        for action in actions {
            calls += 1;
            let result = perform(executor, action, calls).await?;
            tool_output::append(&mut conversation.body, vec![result])?;
        }
    }
}

async fn perform(executor: &mut impl Executor, action: &Value, calls: usize) -> Result<Value> {
    let name = action["name"].as_str().ok_or(HelpError::AnswerFailed)?;
    let call_id = action["call_id"]
        .as_str()
        .filter(|id| !id.is_empty())
        .ok_or(HelpError::AnswerFailed)?;
    let arguments = serde_json::from_str(
        action["arguments"]
            .as_str()
            .ok_or(HelpError::AnswerFailed)?,
    )
    .map_err(|_| HelpError::AnswerFailed)?;
    let result = if calls > MAX_TOOL_CALLS {
        json!({"isError": true, "content": [{"type": "text", "text": "Action limit reached. Summarize progress."}]})
    } else {
        executor.call(name, arguments).await?
    };
    Ok(
        json!({"type": "function_call_output", "call_id": call_id, "output": tool_output::content(result)}),
    )
}

fn final_answer(answer: String) -> Result<String> {
    if answer.trim().is_empty() {
        Err(HelpError::AnswerFailed)
    } else {
        Ok(answer.trim().into())
    }
}

fn append_text(answer: &mut String, text: &str) -> Result<()> {
    if answer.chars().count() + text.chars().count() + 2 > MAX_ANSWER_CHARS {
        return Err(HelpError::AnswerFailed);
    }
    if !text.trim().is_empty() {
        answer.push_str(text);
        answer.push_str("\n\n");
    }
    Ok(())
}

#[cfg(test)]
#[path = "tool_loop_tests.rs"]
mod tests;
