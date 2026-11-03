use crate::storage::{interface_language, InterfaceLanguage};

pub(super) fn deep_seek_sync_error() -> &'static str {
    match interface_language() {
        InterfaceLanguage::Zh => "无法同步 DeepSeek Harness。请检查配置文件格式和写入权限后重试。",
        InterfaceLanguage::En => concat!(
            "Could not sync DeepSeek Harness. ",
            "Check the configuration files and write permissions, then try again.",
        ),
        InterfaceLanguage::Ru => concat!(
            "Не удалось синхронизировать DeepSeek Harness. ",
            "Проверьте файлы конфигурации и права на запись и повторите попытку.",
        ),
        InterfaceLanguage::Ja => "DeepSeek Harness を同期できませんでした。設定ファイルの形式と書き込み権限を確認して、もう一度お試しください。",
    }
}
