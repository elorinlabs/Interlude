// Generated from packages/i18n/platform/desktop/src-tauri/src/local_proxy/error_messages/chinese.rs. Do not edit.
//! Default connection-error copy, shared by the desktop and headless web host.

use super::{diagnostic_fallback, known, transport, transport_attempts, TransportFailure};

pub(super) fn transport_message(value: TransportFailure) -> &'static str {
    match value {
        TransportFailure::TlsClosed => concat!(
            "连接上游服务时，安全连接尚未建立就被断开。",
            "请检查网络或代理是否稳定后重试。",
        ),
        TransportFailure::Certificate => {
            "无法验证上游服务的安全证书。请检查系统时间和代理设置后重试。"
        }
        TransportFailure::Tls => "无法与上游服务建立安全连接。请检查网络或代理设置后重试。",
        TransportFailure::Dns => {
            "无法解析上游服务的地址。请检查网络、代理或服务地址是否正确后重试。"
        }
        TransportFailure::Refused => {
            "连接被上游服务或代理拒绝。请确认服务可用，并检查代理地址和端口。"
        }
        TransportFailure::Disconnected => {
            "与上游服务的连接意外中断，请检查网络或代理是否稳定后重试。"
        }
        TransportFailure::ConnectTimeout => "连接上游服务超时，请检查网络或代理是否可用后重试。",
        TransportFailure::UploadTimeout => {
            "上传请求连续 240 秒无进展，请检查网络或代理是否稳定后重试。"
        }
        TransportFailure::ResponseTimeout => {
            "等待上游服务响应超时，请稍后重试。若持续出现，请检查服务状态。"
        }
        TransportFailure::Connection => "无法连接上游服务，请检查网络、代理和服务地址后重试。",
        TransportFailure::RedirectLimit => {
            "上游 HTTP 重定向次数已达到设置上限。请检查服务地址，或调整最大重定向次数。"
        }
        TransportFailure::RedirectScheme => {
            "上游重定向到了不支持的地址协议；仅支持 HTTP 和 HTTPS。"
        }
        TransportFailure::InvalidRequest => "无法创建上游请求，请检查服务地址格式和自定义请求头。",
        TransportFailure::Proxy => "无法读取或应用网络代理设置，请检查系统代理或 PAC 配置。",
    }
}

pub(super) const INVALID_DETAIL: &str = "错误信息格式无效，请重试。";

pub(super) fn gui(error: &str) -> String {
    if let Some(message) = transport(error) {
        return match transport_attempts(error) {
            Some(count) => format!("{message}已尝试 {count} 次。"),
            None => message.to_string(),
        };
    }
    // Known failures get actionable copy; other failures retain their sanitized cause.
    match error {
        "请先选择 Codex GUI 账户。"
        | "暂时无法读取 Codex GUI 账户，请稍后重试。"
        | "此账户已不可用，请重新选择。"
        | "暂时无法读取自动切号设置，请稍后重试。"
        | "暂无符合条件的账号，请调整自动切号设置或选择其他账户。"
        | "账户已切换，请重新刷新模型列表。" => error,
        "账户设置已更新。" => "账户设置已更新，请重试本次请求。",
        _ => {
            return known::message(error)
                .map(str::to_string)
                .unwrap_or_else(|| diagnostic_fallback(error))
        }
    }
    .to_string()
}

pub(super) fn diagnostic(detail: &str, id: &str) -> String {
    let detail = if detail.is_empty() {
        "未收到具体错误信息。"
    } else {
        detail
    };
    format!("请求失败：{detail}（错误编号 {}）", id)
}
