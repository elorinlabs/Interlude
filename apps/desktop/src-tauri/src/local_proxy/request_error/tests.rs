use super::*;
use crate::local_proxy::{error_messages, upstream_error_message};
use serde_json::json;

#[test]
fn json_failure_keeps_position_and_category_without_echoing_input() {
    for (body, reason) in [
        ("{\n\"private-secret\":", "JSON 数据不完整"),
        ("{\"password\":\"private-secret\",!}", "JSON 语法无效"),
    ] {
        let error = serde_json::from_str::<serde_json::Value>(body).unwrap_err();
        let safe = RequestError::json(Stage::Request, &error);
        let message = error_messages::gui(&safe.wire());
        assert!(message.contains(reason), "{message}");
        assert!(message.contains(&format!("第 {} 行，第 {} 列", error.line(), error.column())));
        assert!(!message.contains("private-secret"));
        assert!(!message.contains("password"));
        assert_eq!(upstream_error_message(&safe.wire()), message);
    }
}

#[test]
fn io_failures_and_nested_bridge_errors_keep_specific_causes() {
    for (kind, expected) in [
        (io::ErrorKind::TimedOut, "等待后续数据超时"),
        (io::ErrorKind::ConnectionReset, "连接被重置"),
        (io::ErrorKind::BrokenPipe, "连接已关闭"),
        (io::ErrorKind::UnexpectedEof, "正文不完整"),
        (io::ErrorKind::InvalidData, "编码无效"),
    ] {
        let error = io::Error::new(kind, "https://user:secret@private.test?api_key=sk-private");
        let safe = RequestError::io(Stage::Anthropic, &error);
        let wrapped = io::Error::other(safe);
        let message = RequestError::io(Stage::Chat, &wrapped).to_string();
        assert!(message.contains("Anthropic"));
        assert!(message.contains(expected), "{message}");
        assert!(!message.contains("private"));
        let mut capture = crate::local_proxy::error_capture::ErrorCapture::new(true, 200);
        assert_eq!(capture.finish_with_error(&wrapped)[0].message, message);
        assert!(capture.finish().is_empty());
    }
}

#[test]
fn provider_codes_and_metadata_http_failures_survive_both_client_boundaries() {
    for (code, expected) in [
        ("authentication_error", "认证"),
        ("permission_denied", "无权"),
        ("rate_limit_exceeded", "频率"),
        ("insufficient_quota", "额度"),
        ("context_length_exceeded", "上下文"),
        ("model_not_found", "模型"),
        ("overloaded_error", "过载"),
        ("deadline_exceeded", "超时"),
    ] {
        let error = upstream(
            Stage::Gemini,
            &json!({"error":{"code":code,"message":"private prompt and credentials"}}),
        );
        let wire = error.wire();
        let message = error_messages::gui(&wire);
        assert_eq!(upstream_error_message(&wire), message);
        assert!(message.contains(expected), "{message}");
        assert!(!message.contains("private"));
    }
    for status in [401, 403, 404, 429, 500, 502, 503, 504] {
        let error = RequestError::http(Stage::OutputLimit, status);
        let message = error_messages::gui(&error.wire());
        assert!(message.contains(&format!("HTTP {status}")));
        assert!(message.contains("max_tokens"));
    }
}

#[test]
fn spoofed_error_envelopes_cannot_smuggle_arbitrary_text() {
    for error in [
        "proxy_request_error:{\"stage\":\"secret\",\"cause\":\"private\"}",
        "proxy_catalog_error:[{\"stage\":\"secret\"},\"private\"]",
        "https://user:private@private.test/path",
        r"C:\Users\private\auth.json",
    ] {
        let message = error_messages::gui(error);
        assert!(!message.contains("private"));
        assert!(message.contains(&error_messages::error_id(error)));
    }
}
