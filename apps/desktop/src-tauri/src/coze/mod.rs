//! Lifecycle for the optional, independently signed Rust Coze runtime.
pub(crate) mod catalog;
pub(crate) mod commands;
mod install;
mod lifecycle;
mod platform;
mod registration;
mod state;

pub(crate) use lifecycle::restore;
pub(crate) use state::CozeState;

use std::path::PathBuf;
use tauri::Manager;

#[derive(Debug, thiserror::Error)]
pub(crate) enum Error {
    #[error("Coze 正在准备中，请稍候。")]
    Busy,
    #[error("请先下载 Coze，再开始使用。")]
    NotInstalled,
    #[error("Coze 下载未完成，请检查网络后重试。")]
    Download,
    #[error("下载内容未通过验证，请重新下载。")]
    Integrity,
    #[error("无法保存 Coze，请检查磁盘空间后重试。")]
    Storage,
    #[error("Coze 未能启动，请重试。")]
    Startup,
    #[error("当前设备暂不支持 Coze。")]
    Unsupported,
    #[error("已有其他同名工具，请先在设置中移除或重命名后重试。")]
    McpConflict,
}

type Result<T> = std::result::Result<T, Error>;

fn root(app: &tauri::AppHandle) -> Result<PathBuf> {
    app.path()
        .app_data_dir()
        .map(|path| path.join("coze"))
        .map_err(|_| Error::Storage)
}
