/// Shared storage helpers still return strings. Classify their known messages at the
/// migration boundary; never pass unrecognized raw errors or local paths to the UI.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum MigrationReason {
    InUse,
    Permission,
    DiskFull,
    MissingFile,
    NotInitialized,
    Incompatible,
    Corrupt,
    Changed,
    Conflict,
    MissingHistory,
    Unknown,
}

impl MigrationReason {
    const PATTERNS: &'static [(Self, &'static [&'static str])] = &[
        (
            Self::InUse,
            &[
                "database is locked",
                "database table is locked",
                "database is busy",
                "being used by another process",
            ],
        ),
        (
            Self::Permission,
            &[
                "permission denied",
                "access is denied",
                "拒绝访问",
                "readonly",
                "read-only",
            ],
        ),
        (
            Self::DiskFull,
            &[
                "disk is full",
                "disk full",
                "no space left",
                "database or disk is full",
            ],
        ),
        (Self::MissingFile, &["no such file", "(os error 2)"]),
        (Self::NotInitialized, &["启动一次 codex"]),
        (
            Self::Incompatible,
            &[
                "暂不支持完整恢复",
                "数据格式已变化",
                "no such table",
                "no such column",
                "has no column named",
                "schema",
            ],
        ),
        (
            Self::Corrupt,
            &[
                "database disk image is malformed",
                "file is not a database",
                "invalid utf-8",
                "expected value at line",
                "expected ident at line",
            ],
        ),
        (
            Self::Changed,
            &["会话内容发生变化", "会话文件在移动时发生变化"],
        ),
        (
            Self::Conflict,
            &["目标会话列表发生变化", "目标位置已有", "already exists"],
        ),
        (
            Self::MissingHistory,
            &["required conversation history is missing"],
        ),
    ];

    pub(super) fn classify(detail: &str) -> Self {
        // Rollback failures must not replace the cause of the original failure.
        let detail = detail.split('；').next().unwrap_or(detail).to_lowercase();
        if let Some(reason) = Self::windows_os_reason(&detail) {
            return reason;
        }
        Self::PATTERNS
            .iter()
            .find_map(|(reason, patterns)| {
                patterns
                    .iter()
                    .any(|pattern| detail.contains(pattern))
                    .then_some(*reason)
            })
            .unwrap_or(Self::Unknown)
    }

    #[cfg(windows)]
    fn windows_os_reason(detail: &str) -> Option<Self> {
        use windows_sys::Win32::Foundation::{
            ERROR_ACCESS_DENIED, ERROR_ALREADY_EXISTS, ERROR_DISK_FULL, ERROR_FILE_EXISTS,
            ERROR_FILE_NOT_FOUND, ERROR_HANDLE_DISK_FULL, ERROR_LOCK_VIOLATION,
            ERROR_PATH_NOT_FOUND, ERROR_SHARING_VIOLATION,
        };
        let (_, code) = detail.rsplit_once("(os error ")?;
        match code.strip_suffix(')')?.parse::<u32>().ok()? {
            ERROR_SHARING_VIOLATION | ERROR_LOCK_VIOLATION => Some(Self::InUse),
            ERROR_ACCESS_DENIED => Some(Self::Permission),
            ERROR_DISK_FULL | ERROR_HANDLE_DISK_FULL => Some(Self::DiskFull),
            ERROR_FILE_NOT_FOUND | ERROR_PATH_NOT_FOUND => Some(Self::MissingFile),
            ERROR_FILE_EXISTS | ERROR_ALREADY_EXISTS => Some(Self::Conflict),
            _ => None,
        }
    }

    #[cfg(not(windows))]
    fn windows_os_reason(_detail: &str) -> Option<Self> {
        None
    }

    pub(super) fn message(&self) -> &'static str {
        match self {
            Self::InUse => {
                "对话数据正被占用。请结束相关任务并关闭使用这些对话的 Codex 窗口后重试。"
            }
            Self::Permission => "没有读写权限。请检查来源、目标和应用数据目录的权限后重试。",
            Self::DiskFull => "磁盘空间不足。请释放来源、目标及应用所在磁盘的空间后重试。",
            Self::MissingFile => "所需文件或目录不存在。请刷新对话列表，并确认目录仍可访问。",
            Self::NotInitialized => "目标尚未准备好。请先用目标目录启动一次 Codex，再重试迁移。",
            Self::Incompatible => "两边的对话数据格式不兼容。请更新并启动两边的 Codex 后重试。",
            Self::Corrupt => "对话数据无法读取或已损坏。请从备份恢复后重试。",
            Self::Changed => "原对话仍在更新。请结束相关任务后重试。",
            Self::Conflict => "目标中出现了已有对话或同名文件。请刷新列表并检查目标对话后重试。",
            Self::MissingHistory => "关联对话的历史记录不完整。请先恢复缺失的对话后重试。",
            Self::Unknown => "遇到未识别的问题。请复制错误信息，并导出诊断日志反馈。",
        }
    }

    pub(super) fn description(&self) -> &str {
        self.message().split('。').next().unwrap_or_default()
    }
}
