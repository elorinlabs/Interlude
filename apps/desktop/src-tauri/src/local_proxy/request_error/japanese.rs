// Generated from packages/i18n/platform/desktop/src-tauri/src/local_proxy/request_error/japanese.rs. Do not edit.
//! Japanese rendering of safe proxy error enums. Wire identifiers remain unchanged.
use std::fmt;

use super::{upstream::Failure, Cause, JsonKind, Problem, ReadFailure, RequestError, Stage};

pub(super) fn fmt(error: &RequestError, f: &mut impl fmt::Write) -> fmt::Result {
    write!(f, "{}に失敗しました。", stage_text(error.stage))?;
    match error.cause {
        Cause::Problem(problem) => f.write_str(problem_text(problem))?,
        Cause::Json { kind, line, column } => {
            write!(f, "{}（{line} 行、{column} 列）。", json_text(kind))?
        }
        Cause::Read(kind) => f.write_str(read_text(kind))?,
        Cause::Http(status) => write!(
            f,
            "サービスから HTTP {status} が返されました：{}。",
            http_reason(status)
        )?,
        Cause::Upstream(reason) => f.write_str(upstream_text(reason))?,
        Cause::Transport(reason) => f.write_str(reason.japanese_message())?,
    }
    if error.stage == Stage::OutputLimit && error.cause != Cause::Problem(Problem::InvalidMaximum) {
        f.write_str("サービスを確認するか、プロバイダーの追加リクエスト設定で max_tokens を指定して再試行してください。")?;
    }
    Ok(())
}

pub(in crate::local_proxy) fn message(error: &RequestError) -> String {
    let mut text = String::new();
    // Formatting into a String cannot fail.
    let _ = fmt(error, &mut text);
    text
}

pub(super) fn catalog(official: &RequestError, admin: &RequestError) -> String {
    format!(
        "公式モデル一覧：{} 予備のモデル一覧：{}",
        message(official),
        message(admin)
    )
}

fn stage_text(stage: Stage) -> &'static str {
    match stage {
        Stage::Request => "リクエストの読み取り",
        Stage::Lite => "Responses Lite リクエストの処理",
        Stage::Chat => "Chat 応答の処理",
        Stage::Anthropic => "Anthropic 応答の処理",
        Stage::Gemini => "Gemini 応答の処理",
        Stage::Responses => "Responses 応答の処理",
        Stage::Read => "サービス応答の読み取り",
        Stage::Catalog => "モデル一覧の取得",
        Stage::OutputLimit => "モデルの最大出力長の取得",
    }
}

pub(in crate::local_proxy) fn problem_text(problem: Problem) -> &'static str {
    match problem {
        Problem::ObjectRequired => "リクエスト本文は JSON オブジェクトである必要があります。",
        Problem::ReasoningObject => "reasoning は JSON オブジェクトまたは null である必要があります。",
        Problem::UnsupportedEncoding => "この圧縮形式には対応していません。identity、gzip、zstd を使用してください。",
        Problem::GzipDecode => "gzip データが破損しているか、不完全です。",
        Problem::ZstdDecode => "zstd データが破損しているか、不完全です。",
        Problem::Encode => "変換した内容を応答形式にエンコードできませんでした。",
        Problem::Framing => "応答を JSON または SSE として認識できません。プロバイダーの API 種類を確認してください。",
        Problem::MissingChoices => "サービスの JSON 応答に choices[0].message がありません。",
        Problem::MissingTerminal => "サービスは送信を終了しましたが、応答の完了イベントがありませんでした。",
        Problem::MissingEventType => "イベントに type フィールドも SSE イベント名もありません。",
        Problem::EventTypeMismatch => "SSE イベント名と JSON の type フィールドが一致しません。",
        Problem::InvalidEvent => "イベントのフィールドまたは順序が API 形式と一致しません。API 種類を確認してください。",
        Problem::MissingBlockIndex => "コンテンツイベントの index は 0 以上の整数である必要があります。",
        Problem::BlockOrder => "コンテンツブロックが未開始、終了済み、または重複しています。",
        Problem::UnknownBlock => "対応していないコンテンツブロックの種類が返されました。",
        Problem::BlockDelta => "コンテンツ差分の種類がブロックと一致しません。",
        Problem::DeltaText => "コンテンツ差分に有効なテキスト文字列がありません。",
        Problem::ToolArguments => "ツール呼び出しの引数は有効な JSON オブジェクトである必要があります。",
        Problem::MissingStopReason => "有効な終了理由またはメッセージ開始イベントがありません。",
        Problem::UnclosedBlock => "メッセージは終了しましたが、閉じられていないコンテンツブロックがあります。",
        Problem::MissingContent => "サービスのメッセージに content 配列または有効なメッセージ種類がありません。",
        Problem::InvalidTool => "ツール呼び出しに名前、ID、または有効な引数オブジェクトがありません。",
        Problem::UnsupportedResponseContent => "現在の API では変換できない画像、ファイル、またはコンテンツが返されました。",
        Problem::Incomplete => "サービスが応答を未完了として終了しました。",
        Problem::ContentFilter => "コンテンツの審査により生成が停止されました。",
        Problem::InvalidModel => "リクエストに有効な model がありません。モデルを選択してください。",
        Problem::ModelEndpoint => "現在のサービス URL からモデル情報 API の URL を特定できません。",
        Problem::MissingMaximum => "モデル情報に正の整数の max_tokens がありません。",
        Problem::InvalidMaximum => "出力長は正の整数で指定してください。リクエストまたは設定の max_tokens を確認してください。",
        Problem::Prepare => "サービスへのリクエストを作成できません。サービス URL と追加ヘッダーを確認してください。",
        Problem::CatalogSettings => "モデル一覧サービスの設定を読み取れません。",
        Problem::CatalogAddress => "モデル一覧サービスの URL が無効です。",
        Problem::CatalogInvalid => "モデル一覧に有効な models 配列、モデル名、または表示可能なモデルがありません。",
        Problem::MissingItem => "出力イベントに item オブジェクトがありません。",
        Problem::MissingItemId => "出力内容に有効な id がありません。",
        Problem::MissingResponse => "完了イベントに response オブジェクトがありません。",
        Problem::ResponseStatus => "完了イベントと response.status が一致しません。",
        Problem::ContentMismatch => "最終的な内容が、先に送信された差分と一致しません。",
    }
}

fn json_text(kind: JsonKind) -> &'static str {
    match kind {
        JsonKind::Syntax => "JSON の構文が無効です",
        JsonKind::Eof => "JSON データが不完全です",
        JsonKind::Data => "JSON フィールドの型が要件と一致しません",
    }
}

fn read_text(kind: ReadFailure) -> &'static str {
    match kind {
        ReadFailure::Timeout => {
            "後続データの待機がタイムアウトしました。データのない状態が設定時間を超えました。"
        }
        ReadFailure::Deadline => "モデル情報の取得がタイムアウトしました。",
        ReadFailure::Reset => "接続がリセットされました。",
        ReadFailure::Closed => "接続が閉じられました。",
        ReadFailure::Eof => "接続が途中で終了し、応答本文が不完全です。",
        ReadFailure::InvalidData => "データのエンコードが無効か、本文が破損しています。",
        ReadFailure::Other => "応答本文の読み取り中に通信エラーが発生しました。",
    }
}

fn http_reason(status: u16) -> &'static str {
    match status {
        400 | 422 => "リクエストのパラメーターが受け付けられませんでした",
        401 => "認証に失敗しました。API キーまたはログイン状態を確認してください",
        403 => "現在のアカウントにはアクセス権がありません",
        404 => "モデルまたは API の URL が見つかりません",
        408 | 504 => "リクエストの処理がタイムアウトしました",
        413 => "リクエストが大きすぎます",
        429 => "リクエスト頻度または使用量の上限に達しました",
        500 => "サービスの内部エラーです",
        502 => "サービスのゲートウェイがリクエストを処理できませんでした",
        503 | 529 => "サービスが混雑しているか、一時的に利用できません",
        300..=399 => "リクエストが転送されました。URL とリダイレクト設定を確認してください",
        _ => "リクエストを処理できませんでした",
    }
}

fn upstream_text(reason: Failure) -> &'static str {
    match reason {
        Failure::Authentication => "認証が拒否されました。API キーを確認するか、再ログインしてください。",
        Failure::Permission => "現在のアカウントはこの API またはモデルにアクセスできません。",
        Failure::RateLimit => "リクエスト頻度または同時実行数の上限に達しました。しばらくしてから再試行してください。",
        Failure::Quota => "サービスの残量が不足しているか、上限に達しています。残高と上限を確認してください。",
        Failure::Model => "モデルまたは API の URL が見つかりません。モデル名とサービス URL を確認してください。",
        Failure::Context => "モデルのコンテキスト上限を超えています。会話を短くするか、添付ファイルを減らしてください。",
        Failure::TooLarge => "リクエストが大きすぎるため拒否されました。内容を減らしてください。",
        Failure::InvalidRequest => "リクエストのパラメーターが拒否されました。モデルが対応する設定と内容の形式を確認してください。",
        Failure::Overloaded => "サービスが混雑しているか、一時的に利用できません。しばらくしてから再試行してください。",
        Failure::Timeout => "サービスの処理がタイムアウトしました。しばらくしてから再試行してください。",
        Failure::Internal => "サービスの内部エラーです。しばらくしてから再試行してください。",
        Failure::ContentFilter => "コンテンツの審査により生成が停止されました。",
        Failure::ToolArguments => "生成されたツール呼び出しの引数の形式が無効です。",
        Failure::Cancelled => "サービスがこの応答をキャンセルしました。",
        Failure::Unknown => "サービスから識別できるエラーコードのないエラーイベントが返されました。",
    }
}
