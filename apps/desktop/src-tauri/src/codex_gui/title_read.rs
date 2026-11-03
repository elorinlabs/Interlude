//! Wait for first-turn metadata without delaying the conversation or retrying unrelated failures.
use super::error::{GuiError, Result};
use serde_json::Value;
use std::{future::Future, time::Duration};

const READ_RETRY_DELAYS_MS: [u64; 6] = [50, 100, 200, 400, 800, 1_600];

pub(super) async fn when_ready<F, Fut>(mut read: F) -> Result<Value>
where
    F: FnMut() -> Fut,
    Fut: Future<Output = Result<Value>>,
{
    for delay in READ_RETRY_DELAYS_MS {
        match read().await {
            Err(GuiError::ThreadNotReady) => tokio::time::sleep(Duration::from_millis(delay)).await,
            result => return result,
        }
    }
    read().await
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::sync::atomic::{AtomicUsize, Ordering};

    #[tokio::test]
    async fn waits_for_initial_metadata_and_preserves_a_manual_name() {
        let calls = AtomicUsize::new(0);
        let result = when_ready(|| async {
            if calls.fetch_add(1, Ordering::SeqCst) < 2 {
                Err(GuiError::ThreadNotReady)
            } else {
                Ok(json!({"thread": {"name": "Manual title"}}))
            }
        })
        .await
        .unwrap();
        assert_eq!(calls.load(Ordering::SeqCst), 3);
        assert_eq!(
            super::super::title_generation::explicit_title(&result["thread"]),
            Some("Manual title")
        );
    }

    #[tokio::test]
    async fn unrelated_errors_are_not_retried_and_unready_threads_have_a_limit() {
        let calls = AtomicUsize::new(0);
        let result = when_ready(|| async {
            calls.fetch_add(1, Ordering::SeqCst);
            Err(GuiError::Rpc)
        })
        .await;
        assert!(matches!(result, Err(GuiError::Rpc)));
        assert_eq!(calls.load(Ordering::SeqCst), 1);
        calls.store(0, Ordering::SeqCst);
        let result = when_ready(|| async {
            calls.fetch_add(1, Ordering::SeqCst);
            Err(GuiError::ThreadNotReady)
        })
        .await;
        assert!(matches!(result, Err(GuiError::ThreadNotReady)));
        assert_eq!(calls.load(Ordering::SeqCst), READ_RETRY_DELAYS_MS.len() + 1);
    }

    #[test]
    fn recognizes_only_the_empty_rollout_read_error_without_exposing_its_path() {
        let message = "failed to read thread: thread-store internal error: rollout at C:/private/thread.jsonl is empty";
        let error = GuiError::from_rpc(&json!({"message": message}));
        assert!(matches!(error, GuiError::ThreadNotReady));
        assert!(!error.to_string().contains("private"));
        for message in [
            "thread not found",
            "model is empty",
            "failed to read thread: permission denied",
        ] {
            assert!(matches!(
                GuiError::from_rpc(&json!({"message": message})),
                GuiError::Rpc
            ));
        }
    }
}
