// Generated from packages/i18n/platform/desktop/src-tauri/src/storage/interface_copy_japanese.rs. Do not edit.
//! Japanese text for native windows, notifications and OAuth callback pages.
use std::borrow::Cow;

pub(super) fn native_text(source: &str) -> Option<&'static str> {
    Some(match source {
        "本轮回复已完成，可以查看结果了。" => {
            "回答が完了しました。結果を確認できます。"
        }
        "本轮回复已完成，点击查看。" => {
            "回答が完了しました。クリックして確認してください。"
        }
        "新对话" => "新しいチャット",
        "图片另存为" => "名前を付けて画像を保存",
        "图片" => "画像",
        "文件另存为" => "名前を付けてファイルを保存",
        "登录 ChatGPT - Interlude" => "ChatGPT にログイン - Interlude",
        "ChatGPT 网页登录 - Interlude" => "ChatGPT Web ログイン - Interlude",
        _ => return None,
    })
}

pub(super) fn callback_text(source: &str) -> Cow<'_, str> {
    if let Some(text) = callback_fixed(source) {
        return Cow::Borrowed(text);
    }
    if let Some(detail) = source.strip_prefix(super::CREDENTIAL_EXCHANGE_FAILED) {
        return Cow::Owned(format!("ログイン認証情報の取得に失敗しました：{detail}"));
    }
    if let Some(status) = source
        .strip_prefix(super::CREDENTIAL_EXCHANGE_HTTP)
        .and_then(|rest| rest.strip_suffix('）'))
    {
        return Cow::Owned(format!(
            "ログイン認証情報の取得に失敗しました（HTTP {status}）"
        ));
    }
    if let Some(detail) = source.strip_prefix(super::INVALID_LOGIN_RESPONSE) {
        return Cow::Owned(format!("ログイン応答の形式が無効です：{detail}"));
    }
    Cow::Borrowed(source)
}

fn callback_fixed(source: &str) -> Option<&'static str> {
    Some(match source {
        "登录请求无效" => "ログインリクエストが無効です",
        "回调地址无法解析，请重新尝试。" => "コールバック URL を解析できません。もう一度お試しください。",
        "页面不存在" => "ページが見つかりません",
        "请回到 Interlude 继续操作。" => "Interlude に戻って操作を続けてください。",
        "安全校验失败" => "セキュリティ確認に失敗しました",
        "登录 state 不匹配，请关闭窗口后重试。" => "ログインの state が一致しません。ウィンドウを閉じて再試行してください。",
        "登录未完成" => "ログインが完了していません",
        "授权响应中缺少 code。" => "認証応答に code がありません。",
        "登录失败" => "ログインに失敗しました",
        "无法创建安全网络连接。" => "安全なネットワーク接続を確立できません。",
        "当前账户凭据已更新，并已重新应用。" => "現在のアカウントの認証情報を更新し、再適用しました。",
        "账户已保存。请回到 Interlude 手动切换到此账户。" => {
            "アカウントを保存しました。Interlude に戻り、このアカウントに切り替えてください。"
        }
        "登录成功" => "ログインしました",
        "登录请求被拒绝（HTTP 403）。请将代理切换为TUN+全局模式后重试，否则登录服务仍可能识别到当前网络来自不支持的地区。" => {
            concat!(
                "ログインリクエストが拒否されました（HTTP 403）。",
                "プロキシを TUN とグローバルモードに切り替えて再試行してください。",
                "それ以外の設定では、対応していない地域からの接続と判定される場合があります。"
            )
        }
        "登录响应缺少 id_token" => "ログイン応答に id_token がありません",
        "登录响应缺少 access_token" => "ログイン応答に access_token がありません",
        "登录响应缺少 refresh_token" => "ログイン応答に refresh_token がありません",
        _ => return None,
    })
}
