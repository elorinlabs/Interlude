//! Tray translations change presentation only; menu IDs and account values stay untouched.
use tauri::{menu::Menu, Runtime};

use super::{account_label, ACCOUNT_PREFIX, FLOATING_BUBBLE_TOGGLE_ID};

struct MenuCopy {
    labels: &'static [(&'static str, &'static str)],
    bubble: [&'static str; 2],
    accounts: [&'static str; 2],
    usage: [&'static str; 2],
}

const RUSSIAN: MenuCopy = MenuCopy {
    labels: &[
        ("tray:accounts-header", "Аккаунты"),
        ("tray:providers-header", "Провайдеры"),
        ("tray:providers-empty", "Нет провайдеров"),
        ("tray:providers-error", "Не удалось загрузить провайдеров"),
        ("tray:settings", "Настройки"),
        ("tray:dashboard", "Обзор"),
        ("tray:restart-chatgpt", "Перезапустить ChatGPT"),
        ("tray:restart-app", "Перезапустить Interlude"),
        ("tray:quit", "Выйти"),
    ],
    bubble: ["Показать индикатор расхода", "Скрыть индикатор расхода"],
    accounts: ["Нет аккаунтов", "Не удалось загрузить аккаунты"],
    usage: ["Основной", "Второй"],
};

const JAPANESE: MenuCopy = MenuCopy {
    labels: &[
        ("tray:accounts-header", "アカウント"),
        ("tray:providers-header", "プロバイダー"),
        ("tray:providers-empty", "プロバイダーがありません"),
        ("tray:providers-error", "プロバイダーを読み込めませんでした"),
        ("tray:settings", "設定"),
        ("tray:dashboard", "ダッシュボード"),
        ("tray:restart-chatgpt", "ChatGPT を再起動"),
        ("tray:restart-app", "Interlude を再起動"),
        ("tray:quit", "終了"),
    ],
    bubble: [
        "使用量のバブル／カードを表示",
        "使用量のバブル／カードを非表示",
    ],
    accounts: ["アカウントがありません", "アカウントを読み込めませんでした"],
    usage: ["メイン", "サブ"],
};

pub(super) fn localize<R: Runtime>(
    menu: &Menu<R>,
    language: Option<&str>,
    bubble_enabled: bool,
) -> Result<(), tauri::Error> {
    let copy = match language {
        Some("ru") => &RUSSIAN,
        Some("ja") => &JAPANESE,
        _ => return Ok(()),
    };
    for &(id, label) in copy.labels {
        set_text(menu, id, label)?;
    }
    set_text(
        menu,
        FLOATING_BUBBLE_TOGGLE_ID,
        copy.bubble[usize::from(bubble_enabled)],
    )?;
    if let Some(item) = menu
        .get("tray:accounts-notice")
        .and_then(|item| item.as_menuitem().cloned())
    {
        item.set_text(copy.accounts[usize::from(item.text()? != "No accounts")])?;
    }
    for item in menu.items()? {
        if !item.id().as_ref().starts_with(ACCOUNT_PREFIX) {
            continue;
        }
        if let Some(item) = item.as_check_menuitem() {
            if let Some(label) = account_label::localized_account_label(&item.text()?, copy.usage) {
                item.set_text(label)?;
            }
        }
    }
    Ok(())
}

fn set_text<R: Runtime>(menu: &Menu<R>, id: &str, text: &str) -> Result<(), tauri::Error> {
    if let Some(item) = menu.get(id).and_then(|item| item.as_menuitem().cloned()) {
        item.set_text(text)?;
    }
    Ok(())
}
