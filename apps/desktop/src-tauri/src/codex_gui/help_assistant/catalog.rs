pub(super) struct Document {
    pub(super) path: &'static str,
    pub(super) keywords: &'static [&'static str],
    pub(super) text: &'static str,
}

macro_rules! document {
    ($path:literal, [$($keyword:literal),*]) => {
        Document {
            path: $path,
            keywords: &[$($keyword),*],
            text: include_str!(concat!(env!("CARGO_MANIFEST_DIR"), "/../../../", $path)),
        }
    };
}

pub(super) const DOCUMENTS: &[Document] = &[
    document!(
        "README.md",
        [
            "remoteai",
            "remote ai",
            "功能",
            "入门",
            "安装",
            "install",
            "介绍"
        ]
    ),
    document!(
        "docs/codex-gui.md",
        ["codex", "对话", "聊天", "账户", "账号", "account", "chat"]
    ),
    document!(
        "docs/chat-settings.md",
        ["设置", "权限", "模型", "推理", "settings", "model"]
    ),
    document!(
        "docs/codex-gui-context-isolation.md",
        ["隔离", "配置", "config", "context"]
    ),
    document!(
        "docs/provider-model-catalog.md",
        ["provider", "模型", "中转", "model", "刷新"]
    ),
    document!(
        "docs/provider-model-reasoning.md",
        ["provider", "推理", "reasoning", "effort"]
    ),
    document!(
        "docs/mobile-chat.md",
        ["手机", "移动", "聊天", "mobile", "web", "android", "ios"]
    ),
    document!(
        "docs/chat-connection-diagnostics.md",
        ["连接", "离线", "断开", "connect", "失败"]
    ),
    document!(
        "docs/remote-desktop.md",
        ["远程", "桌面", "remote", "desktop"]
    ),
    document!(
        "docs/remote-desktop-permissions.md",
        ["权限", "屏幕", "permission", "macos"]
    ),
    document!(
        "docs/computer-use-plugin.md",
        ["插件", "操作电脑", "computer", "plugin"]
    ),
    document!(
        "docs/remote-command-plugin.md",
        ["命令", "终端", "command", "terminal"]
    ),
    document!(
        "docs/chrome-plugin-implementation.md",
        ["浏览器", "chrome", "browser"]
    ),
    document!(
        "docs/token-cost-presets.md",
        ["费用", "价格", "用量", "token", "cost", "usage"]
    ),
    document!("docs/task-review.md", ["任务", "审查", "review", "task"]),
    document!(
        "docs/codex-home-default.md",
        ["目录", "配置", "home", "config"]
    ),
    document!(
        "docs/cloud-session-recovery.md",
        ["登录", "云端", "同步", "cloud", "login"]
    ),
    document!(
        "docs/windows-installers.md",
        ["安装", "windows", "install", "更新"]
    ),
    document!("docs/linux.md", ["linux", "ubuntu", "服务"]),
    document!("docs/in-app-updater.md", ["更新", "升级", "update", "版本"]),
    document!(
        "docs/chat-relay-traffic.md",
        ["流量", "中继", "直连", "relay", "traffic"]
    ),
    document!(
        "apps/desktop/src/components/dashboard/DashboardNavigation.tsx",
        ["菜单", "导航", "menu"]
    ),
    document!(
        "apps/desktop/src-tauri/src/codex_gui/account_selection.rs",
        ["切号", "账户", "账号", "account"]
    ),
    document!(
        "apps/desktop/src-tauri/src/codex_gui/auto_switch_settings.rs",
        ["自动切换", "自动切号", "额度"]
    ),
];
