// Generated from packages/i18n/platform/desktop/src-tauri/src/local_proxy/error_messages/known.rs. Do not edit.
//! Exact legacy errors may be exposed; arbitrary internal strings must stay in diagnostics.
const SEARCH_RESTRICTIONS: &str = concat!(
    "The selected service cannot apply the requested search restrictions. ",
    "Remove these restrictions or choose a service that supports them."
);

pub(super) fn message(error: &str) -> Option<&str> {
    Some(match error {
        "The request body is not valid JSON" | "Request parameters are invalid" =>
            "请求正文不是有效的 JSON，请检查请求格式。",
        "The request body must be a JSON object" | "The request body must be an object" =>
            "请求正文必须是 JSON 对象。",
        "Messages requests must use POST" | "Content generation requests must use POST"
        | "Chat bridge only supports POST requests" => "此接口只接受 POST 请求。",
        "A tool call contains invalid arguments" | "A tool call or result contains invalid arguments" =>
            "工具调用或工具结果的参数格式无效，请检查工具名称、标识和 JSON 参数。",
        "An image uses an unsupported format" | "An attached image or file uses an unsupported format"
        | "The selected service cannot read this attachment format" =>
            "所选接口不支持此附件格式，请检查图片或文件的类型和编码。",
        "The request contains unsupported message content" =>
            "请求包含所选接口不支持的消息内容类型。",
        "The output limit is too small for the selected thinking budget" =>
            "输出长度必须大于思考预算，请调整 max_tokens 或 thinking.budget_tokens。",
        "The output limit must be a positive integer" =>
            "输出长度必须为正整数，请检查 max_tokens。",
        "Forced tool use cannot be combined with thinking" =>
            "此接口不支持同时启用强制工具调用和思考，请调整工具选择或思考设置。",
        "The model name or service address is invalid" => "模型名称或服务地址无效，请检查 Provider 设置。",
        "The selected service cannot apply the requested search restrictions" =>
            "所选接口不支持请求中的搜索范围限制。",
        "Generation settings must request exactly one response candidate" =>
            "此接口每次只支持生成一个候选结果，请将候选数量设为 1。",
        "The previous response is unavailable. Resend the conversation history or start a new conversation." =>
            "找不到上一条响应的会话记录，请重新发送完整对话或开始新对话。",
        "The selected service cannot enforce this tool choice, call limit, or serial tool execution" =>
            "所选接口不支持请求中的工具选择、调用次数限制或串行执行设置。",
        "This endpoint only supports new responses" | "This provider does not support this response operation" =>
            "当前 Provider 只支持创建新响应，不支持本次响应操作。",
        "Codex GUI only supports Codex requests" => "Codex GUI 入口不支持 Anthropic Messages 请求。",
        _ => return routing(error),
    })
}

fn routing(error: &str) -> Option<&str> {
    Some(match error {
        "Aggregate API is disabled" => "当前聚合 API 已停用，请启用后重试或切换服务。",
        "Aggregate API member does not exist" => "当前聚合 API 的成员已不存在，请检查成员设置。",
        "No active account is available for usage sync" => "没有可用于同步用量的当前账户。",
        "Codex account changed before the help request" => "账户已切换，请重新发送帮助请求。",
        "Missing help model" => "帮助请求缺少模型名称，请选择模型后重试。",
        "The selected provider does not support the help model"
        | "The selected aggregate does not support the help model" =>
            "当前服务不支持帮助请求使用的模型，请选择可用模型。",
        "路由设置已变更，请重试请求" => error,
        SEARCH_RESTRICTIONS =>
            "所选接口不支持请求中的搜索限制，请取消限制或切换服务。",
        "The selected service does not support built-in web search. Choose a service that supports web search." =>
            "所选接口不支持内置联网搜索，请切换支持搜索的服务。",
        "Provider group does not contain any available APIs" => "当前 Provider 分组没有可用的 API。",
        "Select an official account" => error,
        "Select an official account before using the local proxy" => "请先选择官方账户再使用本地代理。",
        "Select a non-Agent Identity OAuth account for image generation" =>
            "图片生成需要普通 OAuth 账户，请切换账户后重试。",
        "auth.json is missing tokens.access_token" => "所选账户缺少访问令牌，请重新登录。",
        "Concurrent account router lock is poisoned" => "并发账户路由状态无法读取，请重启应用后重试。",
        _ if super::TransportFailure::RULES.iter().any(|(kind, _)| kind.message() == error) => error,
        _ if error == super::TransportFailure::Connection.message() => error,
        _ => return internal(error),
    })
}

fn internal(error: &str) -> Option<&'static str> {
    // Match trusted operation prefixes, and discard all dynamic values.
    for (prefix, message) in [
        (
            "Managed proxy credential does not match",
            "当前凭据与所选账户不匹配，请重新登录该账户。",
        ),
        (
            "Failed to read account directory:",
            "无法读取本地账户目录，请检查访问权限。",
        ),
        (
            "Failed to read ",
            "无法读取本地配置文件，请检查文件是否存在及访问权限。",
        ),
        (
            "Failed to parse ",
            "本地配置文件格式无效，请检查配置或重新保存设置。",
        ),
        (
            "Failed to write ",
            "无法保存本地配置文件，请检查磁盘空间和访问权限。",
        ),
        (
            "Failed to refresh",
            "账户登录状态刷新失败，请重新登录后重试。",
        ),
        (
            "Unsupported HTTP method ",
            "此请求使用了不支持的 HTTP 方法。",
        ),
    ] {
        if error.starts_with(prefix) {
            return Some(message);
        }
    }
    None
}
