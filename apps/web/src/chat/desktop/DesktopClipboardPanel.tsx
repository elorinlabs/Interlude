import { displayError } from '../../i18n/index';
import { useRef } from 'react';
import { t } from '../../i18n';
import type { useDesktopClipboard } from './useDesktopClipboard';
import { downloadClipboardFile } from './clipboardContent';

export function DesktopClipboardPanel({ clipboard }: { clipboard: ReturnType<typeof useDesktopClipboard> }) {
  const files = useRef<HTMLInputElement>(null);
  const received = clipboard.received;
  return <aside className="rd-settings rd-clipboard" aria-label={t("client.remoteDesktop.clipboard")}>
    <header>{t("client.remoteDesktop.clipboard")}<button onClick={() => clipboard.setOpen(false)}>{t("client.shared.done")}</button></header>
    <p>{t(clipboard.nativeFiles ? "client.remoteDesktop.copyOnOneComputerAndPasteOnTheOtherSupports"
      : "client.remoteDesktop.useCtrlCCtrlXAndCtrlVInThe")}</p>
    <div className="rd-options">
      <button disabled={clipboard.busy} onClick={clipboard.pasteLocal}>{t("client.remoteDesktop.pasteToRemote")}</button>
      <button disabled={clipboard.busy} onClick={() => clipboard.copy()}>{t("client.remoteDesktop.getRemoteClipboard")}</button>
      <button disabled={clipboard.busy} onClick={() => files.current?.click()}>{t("client.remoteDesktop.sendFiles")}</button>
      <input ref={files} type="file" multiple hidden aria-label={t("client.remoteDesktop.chooseFilesToSend")}
        onChange={event => { clipboard.sendFiles(Array.from(event.target.files ?? [])); event.target.value = ''; }} />
    </div>
    <small>{t(clipboard.nativeFiles ? "client.remoteDesktop.upTo64MbAnd32FilesAtATime"
      : "client.remoteDesktop.upTo64MbAnd32FilesAtATime.ad31e9")}</small>
    {clipboard.nativeFileProgress && <small>{t("client.remoteDesktop.afterCopyingFilesStayConnectedUntilPastingFinishes")}</small>}
    {clipboard.status && <p role="status">{displayError(clipboard.status)}
      {clipboard.progress !== undefined && ` ${clipboard.progress}%`}</p>}
    {received?.format === 'text' && <textarea readOnly value={received.text} aria-label={t("client.remoteDesktop.remoteClipboardText")} />}
    {received?.format === 'image' && <img alt={t("client.remoteDesktop.remoteClipboardImage")} src={`data:image/png;base64,${received.data}`} />}
    {received && (received.format !== 'files' || clipboard.nativeFiles)
      && <button disabled={clipboard.busy} onClick={clipboard.save}>
      {t("client.remoteDesktop.copyToThisDevice")}</button>}
    {received?.format === 'files' && !clipboard.nativeFiles
      && <div className="rd-clipboard-files">{received.files.map((file, index) =>
      <button key={`${index}:${file.name}`} onClick={() => downloadClipboardFile(file)}>{t("client.projectBrowser.download")} {file.name}</button>)}</div>}
  </aside>;
}
