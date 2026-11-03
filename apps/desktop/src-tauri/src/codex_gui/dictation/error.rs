/// Safe messages shared by native IPC and the hosted web composer.
#[derive(Debug, thiserror::Error)]
pub(super) enum Error {
    #[error("请先切换到 ChatGPT 账号，再使用语音输入。")]
    AccountRequired,
    #[error("账号已切换，请重新录音。")]
    AccountChanged,
    #[error("账号登录已失效，请重新登录后重试。")]
    Authentication,
    #[error("录音已过期，请重新录音。")]
    Expired,
    #[error("正在转写，请稍候。")]
    Busy,
    #[error("录音无效或过大，请重新录制一段较短的语音。")]
    Audio,
    #[error("转写失败，请重试。")]
    Unavailable,
    #[error("当前账号暂时无法使用语音转写。")]
    Forbidden,
    #[error("语音转写请求过于频繁，请稍后重试。")]
    RateLimited,
    #[error("未能连接语音转写服务，请检查网络后重试。")]
    Network,
    #[error("没有识别到语音，请重新录音。")]
    Empty,
    #[error("已取消录音。")]
    Cancelled,
}

pub(super) type Result<T> = std::result::Result<T, Error>;
