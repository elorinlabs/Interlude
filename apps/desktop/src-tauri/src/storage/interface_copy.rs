// Generated from packages/i18n/platform/desktop/src-tauri/src/storage/interface_copy.rs. Do not edit.
//! Localized native notifications, save dialogs, login windows and OAuth callback pages.
//! Russian and Japanese follow the saved preference. Chinese and English retain their
//! established native copy; unknown provider messages are preserved.

use std::borrow::Cow;

use super::{interface_language, InterfaceLanguage};

#[path = "interface_copy_japanese.rs"]
mod japanese;

/// Returns the copy for a fixed Chinese source string in the saved interface language.
pub(crate) fn native_text(source: &'static str) -> &'static str {
    native_text_for(interface_language(), source)
}

fn native_text_for(language: InterfaceLanguage, source: &'static str) -> &'static str {
    match (language, source) {
        (InterfaceLanguage::En, "显示窗口") => return "Show window",
        (InterfaceLanguage::Ru, "显示窗口") => return "Показать окно",
        (InterfaceLanguage::Ja, "显示窗口") => return "ウィンドウを表示",
        (InterfaceLanguage::En, "退出") => return "Quit",
        (InterfaceLanguage::Ru, "退出") => return "Выход",
        (InterfaceLanguage::Ja, "退出") => return "終了",
        _ => {}
    }
    match language {
        InterfaceLanguage::Ru => russian_native_text(source).unwrap_or(source),
        InterfaceLanguage::Ja => japanese::native_text(source).unwrap_or(source),
        InterfaceLanguage::Zh | InterfaceLanguage::En => source,
    }
}

fn russian_native_text(source: &str) -> Option<&'static str> {
    Some(match source {
        "本轮回复已完成，可以查看结果了。" => {
            "Ответ готов. Можно посмотреть результат."
        }
        "本轮回复已完成，点击查看。" => "Ответ готов. Нажмите, чтобы посмотреть.",
        "新对话" => "Новый чат",
        "图片另存为" => "Сохранить изображение как",
        "图片" => "Изображение",
        "文件另存为" => "Сохранить файл как",
        "登录 ChatGPT - Interlude" => "Вход в ChatGPT — Interlude",
        "ChatGPT 网页登录 - Interlude" => "Вход в веб-версию ChatGPT — Interlude",
        _ => return None,
    })
}

/// Language-specific text of the localhost OAuth callback page.
pub(crate) struct CallbackPageCopy<'a> {
    pub(crate) lang: &'static str,
    pub(crate) title: Cow<'a, str>,
    pub(crate) message: Cow<'a, str>,
}

/// Maps the page title and message once, so every callback response keeps its call site.
/// Messages without a translation (for example, provider error descriptions) stay unchanged.
pub(crate) fn callback_page_copy<'a>(title: &'a str, message: &'a str) -> CallbackPageCopy<'a> {
    callback_page_copy_for(interface_language(), title, message)
}

fn callback_page_copy_for<'a>(
    language: InterfaceLanguage,
    title: &'a str,
    message: &'a str,
) -> CallbackPageCopy<'a> {
    match language {
        InterfaceLanguage::Ja => CallbackPageCopy {
            lang: "ja",
            title: japanese::callback_text(title),
            message: japanese::callback_text(message),
        },
        InterfaceLanguage::Ru => CallbackPageCopy {
            lang: "ru",
            title: russian_callback_text(title),
            message: russian_callback_text(message),
        },
        InterfaceLanguage::En => CallbackPageCopy {
            lang: "en",
            title: english_callback_text(title),
            message: english_callback_text(message),
        },
        InterfaceLanguage::Zh => CallbackPageCopy {
            lang: "zh-CN",
            title: Cow::Borrowed(title),
            message: Cow::Borrowed(message),
        },
    }
}

fn english_callback_text(source:&str)->Cow<'_,str>{
    let translated=match source{
        "登录请求无效"=>"Invalid sign-in request",
        "回调地址无法解析，请重新尝试。"=>"The callback could not be read. Please try signing in again.",
        "页面不存在"=>"Page not found",
        "请回到 Interlude 继续操作。"=>"Return to Interlude to continue.",
        "安全校验失败"=>"Security check failed",
        "登录 state 不匹配，请关闭窗口后重试。"=>"This sign-in session does not match. Close this page and try again.",
        "登录未完成"=>"Sign-in not completed",
        "授权响应中缺少 code。"=>"The authorization response did not include a code.",
        "登录失败"=>"Sign-in failed",
        "无法创建安全网络连接。"=>"Could not establish a secure connection.",
        "当前账户凭据已更新，并已重新应用。"=>"Your account credentials have been updated and applied.",
        "账户已保存。请回到 Interlude 手动切换到此账户。"=>"Your account is saved. Return to Interlude to switch to it.",
        "登录成功"=>"Sign-in successful",
        _=>return Cow::Borrowed(source)
    };Cow::Borrowed(translated)
}

const CREDENTIAL_EXCHANGE_FAILED: &str = "登录凭据交换失败：";
const CREDENTIAL_EXCHANGE_HTTP: &str = "登录凭据交换失败（HTTP ";
const INVALID_LOGIN_RESPONSE: &str = "登录响应格式无效：";

fn russian_callback_text(source: &str) -> Cow<'_, str> {
    if let Some(text) = russian_callback_fixed(source) {
        return Cow::Borrowed(text);
    }
    if let Some(detail) = source.strip_prefix(CREDENTIAL_EXCHANGE_FAILED) {
        return Cow::Owned(format!(
            "Не удалось получить учётные данные для входа: {detail}"
        ));
    }
    if let Some(status) = source
        .strip_prefix(CREDENTIAL_EXCHANGE_HTTP)
        .and_then(|rest| rest.strip_suffix('）'))
    {
        return Cow::Owned(format!(
            "Не удалось получить учётные данные для входа (HTTP {status})"
        ));
    }
    if let Some(detail) = source.strip_prefix(INVALID_LOGIN_RESPONSE) {
        return Cow::Owned(format!("Неверный формат ответа на вход: {detail}"));
    }
    Cow::Borrowed(source)
}

fn russian_callback_fixed(source: &str) -> Option<&'static str> {
    Some(match source {
        "登录请求无效" => "Недействительный запрос на вход",
        "回调地址无法解析，请重新尝试。" => {
            "Не удалось распознать адрес обратного вызова. Повторите попытку."
        }
        "页面不存在" => "Страница не найдена",
        "请回到 Interlude 继续操作。" => "Вернитесь в Interlude, чтобы продолжить.",
        "安全校验失败" => "Проверка безопасности не пройдена",
        "登录 state 不匹配，请关闭窗口后重试。" => {
            "Параметр state не совпадает. Закройте окно и повторите попытку."
        }
        "登录未完成" => "Вход не завершён",
        "授权响应中缺少 code。" => "В ответе авторизации нет параметра code.",
        "登录失败" => "Не удалось войти",
        "无法创建安全网络连接。" => "Не удалось создать защищённое сетевое подключение.",
        "当前账户凭据已更新，并已重新应用。" => {
            "Учётные данные текущего аккаунта обновлены и применены повторно."
        }
        "账户已保存。请回到 Interlude 手动切换到此账户。" => {
            "Аккаунт сохранён. Вернитесь в Interlude и переключитесь на него вручную."
        }
        "登录成功" => "Вход выполнен",
        "登录请求被拒绝（HTTP 403）。请将代理切换为TUN+全局模式后重试，否则登录服务仍可能识别到当前网络来自不支持的地区。" => {
            "Запрос на вход отклонён (HTTP 403). Включите в прокси режим TUN и глобальный режим, затем повторите попытку. Иначе сервис входа может по-прежнему определять, что сеть находится в неподдерживаемом регионе."
        }
        "登录响应缺少 id_token" => "В ответе на вход нет id_token",
        "登录响应缺少 access_token" => "В ответе на вход нет access_token",
        "登录响应缺少 refresh_token" => "В ответе на вход нет refresh_token",
        _ => return None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::with_interface_language;

    const NATIVE_SOURCES: [&str; 8] = [
        "本轮回复已完成，可以查看结果了。",
        "本轮回复已完成，点击查看。",
        "新对话",
        "图片另存为",
        "图片",
        "文件另存为",
        "登录 ChatGPT - Interlude",
        "ChatGPT 网页登录 - Interlude",
    ];

    const CALLBACK_SOURCES: [&str; 17] = [
        "登录请求无效",
        "回调地址无法解析，请重新尝试。",
        "页面不存在",
        "请回到 Interlude 继续操作。",
        "安全校验失败",
        "登录 state 不匹配，请关闭窗口后重试。",
        "登录未完成",
        "授权响应中缺少 code。",
        "登录失败",
        "无法创建安全网络连接。",
        "当前账户凭据已更新，并已重新应用。",
        "账户已保存。请回到 Interlude 手动切换到此账户。",
        "登录成功",
        "登录请求被拒绝（HTTP 403）。请将代理切换为TUN+全局模式后重试，否则登录服务仍可能识别到当前网络来自不支持的地区。",
        "登录响应缺少 id_token",
        "登录响应缺少 access_token",
        "登录响应缺少 refresh_token",
    ];

    fn has_han(text: &str) -> bool {
        text.chars()
            .any(|character| ('\u{4e00}'..='\u{9fff}').contains(&character))
    }

    #[test]
    fn chinese_and_english_keep_the_existing_chinese_copy() {
        for language in [InterfaceLanguage::Zh, InterfaceLanguage::En] {
            for source in NATIVE_SOURCES {
                assert_eq!(native_text_for(language, source), source);
            }
            let page = callback_page_copy_for(language, "登录成功", "登录响应缺少 id_token");
            assert_eq!(page.lang, "zh-CN");
            assert_eq!(page.title, "登录成功");
            assert_eq!(page.message, "登录响应缺少 id_token");
        }
        assert_eq!(native_text("新对话"), "新对话");
        assert_eq!(callback_page_copy("登录成功", "x").lang, "zh-CN");
    }

    #[test]
    fn russian_covers_every_native_and_callback_source_without_chinese() {
        for source in NATIVE_SOURCES {
            let text = native_text_for(InterfaceLanguage::Ru, source);
            assert_ne!(text, source);
            assert!(!has_han(text), "{source} -> {text}");
        }
        for source in CALLBACK_SOURCES {
            let text = russian_callback_text(source);
            assert_ne!(text, source);
            assert!(!has_han(&text), "{source} -> {text}");
        }
        assert_eq!(
            native_text_for(InterfaceLanguage::Ru, "未知文本"),
            "未知文本"
        );
    }

    #[test]
    fn russian_callback_page_maps_templates_and_keeps_unknown_details() {
        let page = callback_page_copy_for(
            InterfaceLanguage::Ru,
            "登录失败",
            "登录凭据交换失败：error sending request",
        );
        assert_eq!(page.lang, "ru");
        assert_eq!(page.title, "Не удалось войти");
        assert_eq!(
            page.message,
            "Не удалось получить учётные данные для входа: error sending request"
        );
        assert_eq!(
            russian_callback_text("登录凭据交换失败（HTTP 500 Internal Server Error）"),
            "Не удалось получить учётные данные для входа (HTTP 500 Internal Server Error)"
        );
        assert_eq!(
            russian_callback_text("登录响应格式无效：expected value"),
            "Неверный формат ответа на вход: expected value"
        );
        for detail in ["access_denied", "无法解析令牌", ""] {
            assert_eq!(russian_callback_text(detail), detail);
        }
    }

    #[test]
    fn accessor_follows_the_thread_language_override() {
        with_interface_language(InterfaceLanguage::Ru, || {
            assert_eq!(native_text("新对话"), "Новый чат");
            let page = callback_page_copy("页面不存在", "请回到 Interlude 继续操作。");
            assert_eq!(page.lang, "ru");
            assert_eq!(page.title, "Страница не найдена");
            assert_eq!(page.message, "Вернитесь в Interlude, чтобы продолжить.");
        });
        assert_eq!(native_text("新对话"), "新对话");
    }

    #[test]
    fn japanese_covers_native_surfaces_and_preserves_provider_details() {
        for source in NATIVE_SOURCES {
            assert_ne!(native_text_for(InterfaceLanguage::Ja, source), source);
        }
        for source in CALLBACK_SOURCES {
            assert_ne!(japanese::callback_text(source), source);
        }
        with_interface_language(InterfaceLanguage::Ja, || {
            assert_eq!(native_text("图片另存为"), "名前を付けて画像を保存");
            let page = callback_page_copy("登录失败", "登录凭据交换失败（HTTP 503）");
            assert_eq!(page.lang, "ja");
            assert_eq!(page.title, "ログインに失敗しました");
            assert_eq!(
                page.message,
                "ログイン認証情報の取得に失敗しました（HTTP 503）"
            );
            assert_eq!(
                callback_page_copy("登录失败", "access_denied").message,
                "access_denied"
            );
        });
        assert_eq!(native_text("图片另存为"), "图片另存为");
    }
}
