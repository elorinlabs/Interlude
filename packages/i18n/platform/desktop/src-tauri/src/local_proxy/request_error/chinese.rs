//! Default request-error copy. Keep serialized causes in the application module.

use super::{upstream::Failure, Cause, JsonKind, Problem, ReadFailure, RequestError, Stage};
use std::fmt;

pub(super) fn fmt(error: &RequestError, f: &mut impl fmt::Write) -> fmt::Result {
    write!(f, "{}失败：", stage_label(error.stage))?;
    match error.cause {
        Cause::Problem(problem) => f.write_str(problem_message(problem))?,
        Cause::Json { kind, line, column } => {
            let reason = match kind {
                JsonKind::Syntax => "JSON 语法无效",
                JsonKind::Eof => "JSON 数据不完整",
                JsonKind::Data => "JSON 字段类型不符合要求",
            };
            write!(f, "{reason}（第 {line} 行，第 {column} 列）。")?;
        }
        Cause::Read(kind) => f.write_str(match kind {
            ReadFailure::Timeout => "等待后续数据超时，连续无数据时间已达到当前设置。",
            ReadFailure::Deadline => "模型信息查询已超过等待时限。",
            ReadFailure::Reset => "传输连接被重置。",
            ReadFailure::Closed => "传输连接已关闭。",
            ReadFailure::Eof => "连接提前结束，响应正文不完整。",
            ReadFailure::InvalidData => "传输数据编码无效或正文已损坏。",
            ReadFailure::Other => "读取响应正文时发生网络传输错误。",
        })?,
        Cause::Http(status) => write!(f, "上游返回 HTTP {status}，{}。", http_reason(status))?,
        Cause::Upstream(reason) => f.write_str(upstream(reason))?,
        Cause::Transport(reason) => f.write_str(reason.message())?,
    }
    if error.stage == Stage::OutputLimit && error.cause != Cause::Problem(Problem::InvalidMaximum) {
        f.write_str("请检查上游服务，或在 Provider 的自定义请求参数中设置 max_tokens 后重试。")?;
    }
    Ok(())
}

fn stage_label(value: Stage) -> &'static str {
    match value {
        Stage::Request => "读取请求",
        Stage::Lite => "处理 Responses Lite 请求",
        Stage::Chat => "处理 Chat 响应",
        Stage::Anthropic => "处理 Anthropic 响应",
        Stage::Gemini => "处理 Gemini 响应",
        Stage::Responses => "处理 Responses 响应",
        Stage::Read => "读取上游响应",
        Stage::Catalog => "读取模型列表",
        Stage::OutputLimit => "查询模型最大输出长度",
    }
}

fn problem_message(value: Problem) -> &'static str {
    match value {
        Problem::ObjectRequired => "请求正文必须是 JSON 对象。",
        Problem::ReasoningObject => "reasoning 必须是 JSON 对象或 null。",
        Problem::UnsupportedEncoding => "不支持此请求压缩格式；支持 identity、gzip 和 zstd。",
        Problem::GzipDecode => "gzip 请求解压失败，压缩数据已损坏或不完整。",
        Problem::ZstdDecode => "zstd 请求解压失败，压缩数据已损坏或不完整。",
        Problem::Encode => "无法将转换后的内容编码为响应格式。",
        Problem::Framing => "上游返回的内容不是可识别的 JSON 或 SSE，请检查 Provider 的接口类型。",
        Problem::MissingChoices => "上游 JSON 缺少 choices[0].message。",
        Problem::MissingTerminal => "上游已结束传输，但没有发送完整的响应结束事件。",
        Problem::MissingEventType => "事件缺少 type，且未提供 SSE event 名称。",
        Problem::EventTypeMismatch => "SSE event 名称与 JSON 中的 type 不一致。",
        Problem::InvalidEvent => "事件字段或顺序不符合所选接口格式，请检查 Provider 的接口类型。",
        Problem::MissingBlockIndex => "内容事件缺少有效的非负整数 index。",
        Problem::BlockOrder => "内容块尚未开始、已结束或被重复创建。",
        Problem::UnknownBlock => "上游返回了不支持的内容块类型。",
        Problem::BlockDelta => "内容增量类型与所属内容块不匹配。",
        Problem::DeltaText => "内容增量缺少有效的文本字符串。",
        Problem::ToolArguments => "工具调用参数不是有效的 JSON 对象。",
        Problem::MissingStopReason => "上游未提供有效的结束原因或消息开始事件。",
        Problem::UnclosedBlock => "消息已结束，但仍有内容块未结束。",
        Problem::MissingContent => "上游消息缺少 content 数组或有效的消息类型。",
        Problem::InvalidTool => "工具调用缺少名称、标识或有效的参数对象。",
        Problem::UnsupportedResponseContent => "上游返回了当前接口无法转换的图片、文件或内容块。",
        Problem::Incomplete => "上游明确标记响应未完成。",
        Problem::ContentFilter => "上游因内容审核停止生成。",
        Problem::InvalidModel => "请求缺少有效的 model，请先选择模型。",
        Problem::ModelEndpoint => "无法从当前服务地址确定模型信息接口。",
        Problem::MissingMaximum => "上游模型信息未提供有效的正整数 max_tokens。",
        Problem::InvalidMaximum => {
            "输出长度必须为正整数，请检查请求或 Provider 中的 max_tokens 设置。"
        }
        Problem::Prepare => "无法创建上游请求，请检查服务地址和自定义请求头。",
        Problem::CatalogSettings => "无法读取模型列表服务设置。",
        Problem::CatalogAddress => "模型列表服务地址无效。",
        Problem::CatalogInvalid => "模型列表缺少有效的 models 数组、模型名称或可见模型。",
        Problem::MissingItem => "输出事件缺少 item 对象。",
        Problem::MissingItemId => "输出内容缺少有效的 id。",
        Problem::MissingResponse => "结束事件缺少 response 对象。",
        Problem::ResponseStatus => "结束事件与 response.status 不一致。",
        Problem::ContentMismatch => "最终内容与此前发送的内容增量不一致。",
    }
}

fn upstream(value: Failure) -> &'static str {
    match value {
        Failure::Authentication => "上游拒绝认证，请检查 API 密钥或重新登录账户。",
        Failure::Permission => "当前账户无权访问此接口或模型。",
        Failure::RateLimit => "上游请求频率或并发数已达上限，请稍后重试。",
        Failure::Quota => "上游额度不足或已用尽，请检查余额和配额。",
        Failure::Model => "上游找不到请求的模型或接口，请检查模型名称和服务地址。",
        Failure::Context => "请求超过模型上下文长度，请缩短对话或减少附件。",
        Failure::TooLarge => "上游拒绝了过大的请求，请减少请求内容。",
        Failure::InvalidRequest => "上游拒绝了请求参数，请检查模型支持的参数和内容格式。",
        Failure::Overloaded => "上游服务过载或暂不可用，请稍后重试。",
        Failure::Timeout => "上游处理请求超时，请稍后重试。",
        Failure::Internal => "上游服务内部处理失败，请稍后重试。",
        Failure::ContentFilter => "上游因内容审核停止生成。",
        Failure::ToolArguments => "上游生成的工具调用参数格式无效。",
        Failure::Cancelled => "上游已取消本次响应。",
        Failure::Unknown => "上游发送了错误事件，但未提供可识别的错误代码。",
    }
}

fn http_reason(status: u16) -> &'static str {
    match status {
        400 | 422 => "请求参数不被接受",
        401 => "认证失败，请检查密钥或登录状态",
        403 => "当前账户没有访问权限",
        404 => "模型或接口不存在",
        408 | 504 => "服务处理超时",
        413 => "请求内容过大",
        429 => "请求受到限流或配额限制",
        500 => "服务内部错误",
        502 => "上游网关无法完成请求",
        503 | 529 => "服务过载或暂不可用",
        300..=399 => "接口发生重定向，请检查地址和重定向设置",
        _ => "接口未返回成功状态",
    }
}

pub(super) fn catalog(official: &RequestError, admin: &RequestError) -> String {
    format!("官方模型列表：{official} 备用模型列表：{admin}")
}
