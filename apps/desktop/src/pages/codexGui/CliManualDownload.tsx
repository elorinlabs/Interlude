import { useState } from "react";
import { Alert, Button, Modal } from "antd";
import { Download, ExternalLink, FileUp } from "lucide-react";
import { uiText } from "../../i18n/uiText";
import type { CliSnapshot } from "./cliManualDownloadApi";
import { useCliManualDownload } from "./useCliManualDownload";
import styles from "./CliManualDownload.module.less";

interface Props { version: string | null; onImported: (value: CliSnapshot) => Promise<void>; disabled?: boolean }

export function CliManualDownload(props: Props) {
  const [selection, setSelection] = useState<{ version: string | null } | null>(null);
  return <>
    <Button icon={<Download size={15} />} disabled={props.disabled}
      onClick={() => setSelection({ version: props.version })}>
      {uiText("client.cliImport.manualDownload")}
    </Button>
    {selection && <DownloadDialog {...props} version={selection.version} onClose={() => setSelection(null)} />}
  </>;
}

function DownloadDialog({ version, onImported, onClose }: Props & { onClose: () => void }) {
  const state = useCliManualDownload(version, onImported);
  const { links, busy, result } = state;
  const staged = result?.release?.ready;
  return <Modal open centered title={uiText("client.cliImport.downloadCodexManually")} width={448} className={styles.dialog}
    onCancel={onClose} closable={!busy} maskClosable={!busy} keyboard={!busy}
    footer={<div className={styles.actions}>
      <Button disabled={busy} onClick={onClose}>{uiText("client.projectBrowser.close")}</Button>
      <Button type="primary" icon={<FileUp size={15} />} loading={state.importing}
        disabled={busy || !state.packagePath || Boolean(result)}
        onClick={() => void state.importFiles()}>{uiText("client.cliImport.importAndInstall")}</Button>
    </div>}>
    <div className={styles.content}>
      <p>{uiText("client.cliImport.downloadTheCompletePackageAndImportItWithoutExtractingIt")}</p>
      {links && <>
        <div className={styles.platform}>{uiText("client.cliImport.for", { platform: links.platform })}
          {version && <span> · Codex {version}</span>}</div>
        <FileStep title={uiText("client.cliImport.1CompletePackage")} href={links.packageUrl}
          description={links.assetName} selected={state.packagePath} disabled={busy}
          onChoose={() => void state.choose("package")} />
        <FileStep title={uiText("client.cliImport.2ReleaseVerificationFile")} href={links.metadataUrl} optional
          description={uiText("client.cliImport.openTheLinkAndSaveThePageAsAFile")}
          selected={state.metadataPath} disabled={busy} onChoose={() => void state.choose("metadata")}
          onClear={state.clearMetadata} />
        <a href={links.releaseUrl} target="_blank" rel="noopener noreferrer" className={styles.release}>
          <ExternalLink size={14} />{uiText("client.composer.officialReleases")}</a>
      </>}
      {!links && !state.error && <p role="status">{uiText("client.cliImport.preparingDownloadLinks")}</p>}
      <p className={styles.note}>{uiText("client.cliImport.useAVerificationFileFromTheSameReleaseIfProvided")}</p>
      {state.importing && <p role="status">{uiText("client.cliImport.verifyingAndImportingFilesPleaseWait")}</p>}
      {state.error && <Alert type="error" showIcon message={state.error} />}
      {result && <Alert type="success" showIcon message={uiText(staged
        ? "client.cliImport.importedSuccessfullyTheUpdateWillInstallWhenIdleOrOn" : "client.cliImport.codexIsInstalledAndReadyToUse")} />}
    </div>
  </Modal>;
}

function FileStep({ title, description, href, selected, disabled, optional, onChoose, onClear }: {
  title: string; description: string; href: string; selected: string; disabled: boolean; onChoose: () => void;
  optional?: boolean; onClear?: () => void;
}) {
  const filename = selected.split(/[\\/]/).pop();
  return <section className={styles.file}>
    <div className={styles.fileHeading}><strong>{title}</strong>
      {optional && <span className={styles.optional}>{uiText("client.cliImport.optional")}</span>}</div>
    <p>{description}</p>
    <div className={styles.actions}>
      <Button icon={<ExternalLink size={14} />} href={href} target="_blank" rel="noopener noreferrer">
        {uiText("client.cliImport.downloadFile")}</Button>
      <Button icon={<FileUp size={14} />} disabled={disabled} onClick={onChoose}>
        {uiText(selected ? "client.cliImport.chooseAnotherFile" : "client.cliImport.chooseFile")}</Button>
      {selected && onClear && <Button type="text" disabled={disabled} onClick={onClear}>{uiText("client.cliImport.remove")}</Button>}
    </div>
    {selected && <div className={styles.selected}>{uiText("client.cliImport.selected", { filename: filename || selected })}</div>}
  </section>;
}
