import { uiText } from "../../i18n/uiText";
import { Button, Progress } from "antd";
import { Download, ExternalLink, RefreshCw, Terminal } from "lucide-react";
import { isDesktopApp } from "../../api/backend";
import type { useCliInstaller } from "./useCliInstaller";
import { CliManualDownload } from "./CliManualDownload";
import styles from "./styles.module.less";

export function Installer({ installer, compact = false, running = false, remote = false, disabled = false }: {
  installer: Omit<ReturnType<typeof useCliInstaller>, "onImported"> &
    Partial<Pick<ReturnType<typeof useCliInstaller>, "onImported">>; compact?: boolean; running?: boolean;
  remote?: boolean; disabled?: boolean;
}) {
  const { version, release, checking, installing, progress, checked, check, install } = installer;
  const available = release && release.version !== version;
  return <div className={compact ? styles.installCompact : styles.install}>
    {!compact && <div className={styles.welcomeIcon}><Terminal size={30} /></div>}
    <h2>{version ? `Codex ${version}` : uiText("client.conversation.getStartedWithCodexGui")}</h2>
    {!version && <p>{remote ? uiText("client.conversation.checkAndUpdateCodexOnTheSelectedRemoteComputer")
      : uiText("client.conversation.downloadCodexToStartConversationsWorkOnCodeAndManage")}</p>}
    {!compact && <p className={styles.muted}>{isDesktopApp
      ? uiText("client.conversation.conversationsHereAreSavedSeparatelyAndDoNotAffectYour")
      : uiText("client.conversation.codexRunsOnTheComputerHostingInterludeWhereThese")}</p>}
    <div className={styles.installActions}>
      {available && <Button type="primary" icon={<Download size={16} />} loading={installing}
        disabled={running || disabled} onClick={() => void install()}>
        {version ? uiText("client.conversation.updateTo") : uiText("client.conversation.downloadAndStart")} {release.version}
      </Button>}
      {!available && <Button loading={checking || !checked} icon={<RefreshCw size={15} />}
        disabled={installing || disabled} onClick={() => void check()}>{release && version ? uiText("client.conversation.upToDate") : uiText("client.conversation.checkForUpdates")}</Button>}
      {isDesktopApp && !remote && installer.onImported && <CliManualDownload version={release?.version ?? null}
        disabled={installing || disabled} onImported={installer.onImported} />}
      <Button type="text" icon={<ExternalLink size={14} />} href="https://github.com/openai/codex/releases"
        target="_blank" rel="noopener noreferrer">{uiText("client.composer.officialReleases")}</Button>
    </div>
    {available && !installing && <small>{release.ready
      ? uiText("client.conversation.theUpdateIsDownloadedAndWillInstallWhenNoConversations")
      : uiText("client.conversation.downloadAboutMb", { value1: Math.ceil(release.size / 1024 / 1024) })}</small>}
    {running && available && <small>{uiText("client.conversation.youCanUpdateWhenTheCurrentTaskFinishes")}</small>}
    {installing && <div className={styles.downloadProgress}>
      <Progress percent={progress ? Math.floor(progress.downloaded / Math.max(progress.total, 1) * 100) : 0}
        status="active" size="small" />
      <span>{progress?.phase === "installing" ? uiText("client.app.installingAlmostDone") : uiText("client.conversation.downloadingCodex")}</span>
    </div>}
  </div>;
}
