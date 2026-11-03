//! Japanese display text for proxy failures. Sensitive diagnostic details remain in the logs.
use super::TransportFailure;
use crate::local_proxy::request_error::{japanese::problem_text, Problem};

impl TransportFailure {
    pub(in crate::local_proxy) fn japanese_message(self) -> &'static str {
        match self {
            Self::TlsClosed => "安全な接続の確立前に通信が切断されました。ネットワークやプロキシを確認して再試行してください。",
            Self::Certificate => "サービスの証明書を検証できません。システム時刻とプロキシ設定を確認してください。",
            Self::Tls => "サービスへの安全な接続を確立できません。ネットワークやプロキシ設定を確認してください。",
            Self::Dns => "サービスのアドレスを解決できません。ネットワーク、プロキシ、サービス URL を確認してください。",
            Self::Refused => "サービスまたはプロキシが接続を拒否しました。サービスの状態とプロキシのアドレス、ポートを確認してください。",
            Self::Disconnected => "サービスとの接続が予期せず切断されました。ネットワークやプロキシを確認して再試行してください。",
            Self::ConnectTimeout => "サービスへの接続がタイムアウトしました。ネットワークやプロキシを確認してください。",
            Self::UploadTimeout => "アップロードが 240 秒間進行しませんでした。ネットワークやプロキシを確認して再試行してください。",
            Self::ResponseTimeout => "サービスの応答待ちがタイムアウトしました。再発する場合はサービスの状態を確認してください。",
            Self::Connection => "サービスに接続できません。ネットワーク、プロキシ、サービス URL を確認してください。",
            Self::RedirectLimit => "HTTP リダイレクト回数が上限に達しました。サービス URL またはリダイレクト上限を確認してください。",
            Self::RedirectScheme => "対応していないプロトコルにリダイレクトされました。HTTP と HTTPS のみ対応しています。",
            Self::InvalidRequest => "リクエストを作成できません。サービス URL の形式と追加ヘッダーを確認してください。",
            Self::Proxy => "プロキシ設定を読み取るか適用することができません。システムのプロキシまたは PAC 設定を確認してください。",
        }
    }
}

pub(super) fn gui(error: &str) -> String {
    if let Some(failure) = super::transport_failure(error) {
        let message = failure.japanese_message();
        return match super::transport_attempts(error) {
            Some(count) => format!("{message} 試行回数：{count} 回。"),
            None => message.to_string(),
        };
    }
    if let Some(message) = lookup(ACCOUNT, error) {
        return message.to_string();
    }
    if is_rendered(error) {
        return error.to_string();
    }
    match super::known::message(error) {
        Some(known) => known_text(known).to_string(),
        None => format!(
            "ローカルプロキシでリクエストを処理できませんでした（エラー番号 {}）。診断ログをエクスポートして詳細を確認してください。",
            super::error_id(error)
        ),
    }
}

pub(super) fn fixed(source: &str) -> Option<&'static str> {
    Some(match source {
        "Chat 响应包含不支持的 finish_reason，生成未正常完成。" => {
            "Chat 応答の finish_reason に対応していない値が含まれています。生成が正常に完了しませんでした。"
        }
        "Chat 响应中的工具调用缺少名称，或参数 JSON 不完整。" => {
            "Chat 応答のツール呼び出しに名前がないか、引数の JSON が不完全です。"
        }
        "上游已结束传输，但没有发送完整的响应结束事件。" => problem_text(Problem::MissingTerminal),
        _ => return None,
    })
}

fn known_text(source: &str) -> &str {
    lookup(KNOWN, source)
        .or_else(|| {
            transport_failures()
                .find(|failure| failure.message() == source)
                .map(TransportFailure::japanese_message)
        })
        .unwrap_or(source)
}

fn is_rendered(text: &str) -> bool {
    ACCOUNT
        .iter()
        .chain(KNOWN)
        .any(|(_, translated)| *translated == text)
        || transport_failures().any(|failure| failure.japanese_message() == text)
}

fn transport_failures() -> impl Iterator<Item = TransportFailure> {
    TransportFailure::RULES
        .iter()
        .map(|(failure, _)| *failure)
        .chain([TransportFailure::Connection])
}

fn lookup(table: &[(&str, &'static str)], source: &str) -> Option<&'static str> {
    table
        .iter()
        .find(|(original, _)| *original == source)
        .map(|(_, translated)| *translated)
}

const ACCOUNT: &[(&str, &str)] = &[
    ("请先选择 Codex GUI 账户。", "Codex GUI のアカウントを選択してください。"),
    ("暂时无法读取 Codex GUI 账户，请稍后重试。", "Codex GUI のアカウントを読み取れません。しばらくしてから再試行してください。"),
    ("此账户已不可用，请重新选择。", "このアカウントは利用できなくなりました。別のアカウントを選択してください。"),
    ("暂时无法读取自动切号设置，请稍后重试。", "アカウント自動切り替え設定を読み取れません。しばらくしてから再試行してください。"),
    ("暂无符合条件的账号，请调整自动切号设置或选择其他账户。", "条件に合うアカウントがありません。自動切り替え設定を変更するか、別のアカウントを選択してください。"),
    ("账户已切换，请重新刷新模型列表。", "アカウントが切り替わりました。モデル一覧を更新してください。"),
    ("账户设置已更新。", "アカウント設定を更新しました。リクエストを再試行してください。"),
];

#[cfg(test)]
#[path = "japanese_tests.rs"]
mod tests;

const KNOWN: &[(&str, &str)] = &[
    ("此接口只接受 POST 请求。", "この API は POST リクエストのみ受け付けます。"),
    ("工具调用或工具结果的参数格式无效，请检查工具名称、标识和 JSON 参数。", "ツール呼び出しまたは結果の引数が無効です。ツール名、ID、JSON 引数を確認してください。"),
    ("所选接口不支持此附件格式，请检查图片或文件的类型和编码。", "選択した API はこの添付ファイルの形式に対応していません。画像やファイルの種類とエンコードを確認してください。"),
    ("请求正文不是有效的 JSON，请检查请求格式。", "リクエスト本文が有効な JSON ではありません。形式を確認してください。"),
    ("请求正文必须是 JSON 对象。", "リクエスト本文は JSON オブジェクトである必要があります。"),
    ("请求包含所选接口不支持的消息内容类型。", "選択した API が対応していないメッセージ種類が含まれています。"),
    ("输出长度必须大于思考预算，请调整 max_tokens 或 thinking.budget_tokens。", "出力長は思考予算より大きくする必要があります。max_tokens または thinking.budget_tokens を調整してください。"),
    ("输出长度必须为正整数，请检查 max_tokens。", "出力長は正の整数で指定してください。max_tokens を確認してください。"),
    ("此接口不支持同时启用强制工具调用和思考，请调整工具选择或思考设置。", "この API は強制ツール呼び出しと思考の同時使用に対応していません。ツール選択または思考設定を変更してください。"),
    ("模型名称或服务地址无效，请检查 Provider 设置。", "モデル名またはサービス URL が無効です。プロバイダー設定を確認してください。"),
    ("所选接口不支持请求中的搜索范围限制。", "選択した API はリクエストの検索範囲制限に対応していません。"),
    ("此接口每次只支持生成一个候选结果，请将候选数量设为 1。", "この API はリクエストごとに 1 件の候補のみ生成できます。候補数を 1 にしてください。"),
    ("找不到上一条响应的会话记录，请重新发送完整对话或开始新对话。", "直前の応答の会話履歴が見つかりません。会話全体を再送信するか、新しい会話を開始してください。"),
    ("所选接口不支持请求中的工具选择、调用次数限制或串行执行设置。", "選択した API はツール選択、呼び出し回数制限、または逐次実行設定に対応していません。"),
    ("当前 Provider 只支持创建新响应，不支持本次响应操作。", "現在のプロバイダーは新しい応答の作成のみ対応しています。この応答操作は利用できません。"),
    ("Codex GUI 入口不支持 Anthropic Messages 请求。", "Codex GUI のエンドポイントは Anthropic Messages リクエストに対応していません。"),
    ("当前聚合 API 已停用，请启用后重试或切换服务。", "現在の統合 API は無効です。有効にして再試行するか、別のサービスに切り替えてください。"),
    ("当前聚合 API 的成员已不存在，请检查成员设置。", "統合 API のメンバーが存在しません。メンバー設定を確認してください。"),
    ("没有可用于同步用量的当前账户。", "使用量を同期できる現在のアカウントがありません。"),
    ("账户已切换，请重新发送帮助请求。", "アカウントが切り替わりました。ヘルプへの質問を再送信してください。"),
    ("帮助请求缺少模型名称，请选择模型后重试。", "ヘルプリクエストにモデル名がありません。モデルを選択して再試行してください。"),
    ("当前服务不支持帮助请求使用的模型，请选择可用模型。", "現在のサービスはヘルプのモデルに対応していません。利用可能なモデルを選択してください。"),
    ("路由设置已变更，请重试请求", "ルーティング設定が変更されました。リクエストを再試行してください"),
    ("所选接口不支持请求中的搜索限制，请取消限制或切换服务。", "選択した API は検索制限に対応していません。制限を解除するか、サービスを切り替えてください。"),
    ("所选接口不支持内置联网搜索，请切换支持搜索的服务。", "選択した API は組み込みの Web 検索に対応していません。対応するサービスに切り替えてください。"),
    ("当前 Provider 分组没有可用的 API。", "現在のプロバイダーグループに利用可能な API がありません。"),
    ("Select an official account", "公式アカウントを選択してください"),
    ("请先选择官方账户再使用本地代理。", "公式アカウントを選択してからローカルプロキシを使用してください。"),
    ("图片生成需要普通 OAuth 账户，请切换账户后重试。", "画像生成には通常の OAuth アカウントが必要です。アカウントを切り替えて再試行してください。"),
    ("所选账户缺少访问令牌，请重新登录。", "選択したアカウントにアクセストークンがありません。再ログインしてください。"),
    ("并发账户路由状态无法读取，请重启应用后重试。", "並列アカウントのルーティング状態を読み取れません。アプリを再起動して再試行してください。"),
    ("当前凭据与所选账户不匹配，请重新登录该账户。", "現在の認証情報と選択したアカウントが一致しません。そのアカウントに再ログインしてください。"),
    ("无法读取本地账户目录，请检查访问权限。", "ローカルアカウントのフォルダを読み取れません。アクセス権を確認してください。"),
    ("无法读取本地配置文件，请检查文件是否存在及访问权限。", "ローカル設定ファイルを読み取れません。ファイルの存在とアクセス権を確認してください。"),
    ("本地配置文件格式无效，请检查配置或重新保存设置。", "ローカル設定ファイルの形式が無効です。設定を確認するか、保存し直してください。"),
    ("无法保存本地配置文件，请检查磁盘空间和访问权限。", "ローカル設定ファイルを保存できません。空き容量とアクセス権を確認してください。"),
    ("账户登录状态刷新失败，请重新登录后重试。", "アカウントのログイン状態を更新できませんでした。再ログインしてお試しください。"),
    ("此请求使用了不支持的 HTTP 方法。", "このリクエストの HTTP メソッドには対応していません。"),
];
