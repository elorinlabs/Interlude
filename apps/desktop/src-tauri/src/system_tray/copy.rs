// Generated from packages/i18n/platform/desktop/src-tauri/src/system_tray/copy.rs. Do not edit.
// Text shared by the native tray and its quick-menu presentation.
pub(super) enum Text {
    Accounts,
    Settings,
    Dashboard,
    RestartChatGPT,
    RestartInterlude,
    Quit,
    Providers,
    NoProviders,
    UnableToLoadProviders,
    UnableToLoadAccounts,
    NoAccounts,
}

pub(super) fn text(chinese: bool, key: Text) -> &'static str {
    let (zh, en) = match key {
        Text::Accounts => ("账号", "Accounts"),
        Text::Settings => ("设置", "Settings"),
        Text::Dashboard => ("仪表板", "Dashboard"),
        Text::RestartChatGPT => ("重启 ChatGPT", "Restart ChatGPT"),
        Text::RestartInterlude => ("重启 Interlude", "Restart Interlude"),
        Text::Quit => ("退出程序", "Quit"),
        Text::Providers => ("服务商", "Providers"),
        Text::NoProviders => ("暂无服务商", "No providers"),
        Text::UnableToLoadProviders => ("服务商读取失败", "Unable to load providers"),
        Text::UnableToLoadAccounts => ("账号读取失败", "Unable to load accounts"),
        Text::NoAccounts => ("暂无账号", "No accounts"),
    };
    if chinese {
        zh
    } else {
        en
    }
}

/// Labels shown until the first full menu is built; they follow the tray language policy.
#[cfg(any(not(windows), test))]
pub(super) fn initial_menu_labels(
    language: Option<&str>,
) -> (&'static str, &'static str, &'static str) {
    match language {
        Some("zh") => ("Dashboard", "正在加载…", "Quit"),
        Some("ru") => ("Обзор", "Загрузка…", "Выйти"),
        Some("ja") => ("ダッシュボード", "読み込み中…", "終了"),
        _ => ("Dashboard", "Loading…", "Quit"),
    }
}

pub(super) fn floating_bubble_toggle_label(chinese: bool, enabled: bool) -> &'static str {
    match (chinese, enabled) {
        (true, true) => "隐藏悬浮球 / 卡片",
        (true, false) => "显示悬浮球 / 卡片",
        (false, true) => "Hide Usage Bubble/Card",
        (false, false) => "Show Usage Bubble/Card",
    }
}

pub(super) fn usage_labels(chinese: bool) -> (&'static str, &'static str) {
    if chinese {
        ("主", "次")
    } else {
        ("Primary", "Secondary")
    }
}
