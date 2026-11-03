use std::fmt;

use super::home_migration_reason::MigrationReason;

#[derive(Clone, Copy, Debug)]
pub(super) enum MigrationStage {
    Source,
    Destination,
    ReadSource,
    ReadDestination,
    Backup,
    WriteDestinationFiles,
    WriteDestinationHistory,
    VerifySource,
    RemoveSource,
    Worker,
}

impl MigrationStage {
    fn label(self) -> &'static str {
        match self {
            Self::Source => "打开来源目录",
            Self::Destination => "打开目标目录",
            Self::ReadSource => "读取原对话",
            Self::ReadDestination => "读取目标对话",
            Self::Backup => "备份原对话",
            Self::WriteDestinationFiles => "复制对话记录",
            Self::WriteDestinationHistory => "保存目标对话",
            Self::VerifySource => "检查原对话是否有变化",
            Self::RemoveSource => "移除已迁移的原对话",
            Self::Worker => "执行迁移",
        }
    }
}

#[derive(Clone, Copy, Debug)]
pub(super) enum MigrationRecovery {
    Unchanged,
    Restored,
    Incomplete,
    Unknown,
}

/// Retains the original cause for diagnostics; Display exposes only curated, actionable copy.
#[derive(Debug)]
pub(super) struct MigrationFailure {
    pub(super) stage: MigrationStage,
    pub(super) detail: String,
    pub(super) session_id: Option<String>,
    pub(super) recovery: MigrationRecovery,
    pub(super) rollback_error: Option<String>,
    pub(super) cleanup_error: Option<String>,
}

impl MigrationFailure {
    pub(super) fn new(stage: MigrationStage, detail: impl ToString) -> Self {
        Self {
            stage,
            detail: detail.to_string(),
            session_id: None,
            recovery: MigrationRecovery::Unchanged,
            rollback_error: None,
            cleanup_error: None,
        }
    }

    pub(super) fn for_session(mut self, id: &str) -> Self {
        self.session_id = Some(id.to_owned());
        self
    }

    pub(super) fn diagnostic(&self) -> String {
        format!(
            "stage={:?}; reason={:?}; session={:?}; recovery={:?}; cause={}; rollback={:?}; cleanup={:?}",
            self.stage,
            MigrationReason::classify(&self.detail),
            self.session_id,
            self.recovery,
            self.detail,
            self.rollback_error,
            self.cleanup_error,
        )
    }
}

impl std::error::Error for MigrationFailure {}

impl fmt::Display for MigrationFailure {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        let reason = MigrationReason::classify(&self.detail);
        write!(
            formatter,
            "迁移未完成：{}时，{}。",
            self.stage.label(),
            reason.description()
        )?;
        if matches!(
            self.recovery,
            MigrationRecovery::Unchanged | MigrationRecovery::Restored
        ) {
            if let Some((_, suggestion)) = reason.message().split_once('。') {
                write!(formatter, "{suggestion}")?;
            }
        }
        let recovery = match self.recovery {
            MigrationRecovery::Unchanged => "原对话未改动。",
            MigrationRecovery::Restored => "本次更改已撤销，原对话已保留。",
            MigrationRecovery::Incomplete => {
                "部分内容未能还原，迁移备份已保留。请先导出诊断日志并联系支持，暂勿重复迁移。"
            }
            MigrationRecovery::Unknown => "请先检查两边的对话，再导出诊断日志并联系支持。",
        };
        write!(formatter, "\n{recovery}")?;
        if self.cleanup_error.is_some() {
            write!(formatter, "临时备份未能清理。")?;
        }
        Ok(())
    }
}
