import { displayError } from '../i18n/index';
import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { ArrowLeft, ChevronRight, Download, Folder } from 'lucide-react';
import type { DownloadBrowse } from '../../../../shared/remote-chat/downloads';
import type { ProjectFile, ProjectFilesResponse } from '../../../../shared/remote-chat/projectFiles';
import { t } from '../i18n';
import { downloadManager } from './manager';
import type { DownloadConnection } from './types';
import { animateDownloadToNavigation, downloadOrigin } from './downloadFeedback';

export function DownloadBrowser({ connection, scope, back }: {
  connection: DownloadConnection; scope: DownloadBrowse['scope']; back: () => void;
}) {
  const [directories, setDirectories] = useState(['']);
  const directory = directories.at(-1)!;
  const [result, setResult] = useState<ProjectFilesResponse>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [revision, setRevision] = useState(0);
  const pending = useRef(false);
  const { client, ready, threadId, cwd } = connection;
  useEffect(() => {
    let cancelled = false;
    setResult(undefined); setError(''); setNotice(''); setLoading(ready);
    if (!ready) return;
    void client.browse({ scope, directory, threadId, cwd })
      .then(value => { if (!cancelled) setResult(value); })
      .catch(() => { if (!cancelled) setError('无法读取文件夹，请确认电脑已更新并连接后重试。'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [client, ready, scope, directory, threadId, cwd, revision]);
  const choose = async (file: ProjectFile, event: MouseEvent<HTMLButtonElement>) => {
    if (file.directory) { setDirectories(current => [...current, file.path]); return; }
    if (pending.current) return;
    const origin = downloadOrigin(event);
    pending.current = true; setNotice(''); setError('');
    try {
      await downloadManager.enqueue({ owner: connection.owner, deviceId: connection.deviceId,
        deviceName: connection.deviceName, scope, threadId, cwd, path: file.path });
      setNotice('已加入下载管理。');
      animateDownloadToNavigation(origin);
    } catch { setError('暂时无法下载，请检查浏览器存储空间后重试。'); }
    finally { pending.current = false; }
  };
  const goBack = () => directories.length > 1 ? setDirectories(current => current.slice(0, -1)) : back();
  return <section className="downloads-page">
    <header className="downloads-header">
      <button type="button" className="download-icon-button" aria-label={t("client.downloads.goBack")} onClick={goBack}>
        <ArrowLeft size={22} /></button><h2>{t(scope === 'computer' ? "client.downloads.thisComputer" : "client.downloads.currentProject")}</h2>
      <button type="button" className="download-button" onClick={back}>{t("client.downloads.downloadList")}</button>
    </header>
    <div className="download-card">
      <p className="download-path">{result?.directory || directory || connection.deviceName}</p>
      {!ready && <p role="status">{t("client.downloads.connectToThisComputerToBrowseItsFiles")}</p>}
      {notice && <p role="status" className="download-notice">{displayError(notice)}</p>}
      {error && <p role="alert" className="download-notice">{displayError(error)}{' '}
        <button type="button" onClick={() => setRevision(value => value + 1)}>{t("client.terminal.retry")}</button></p>}
      {loading && <p role="status">{t("client.downloads.readingFolder")}</p>}
      {!loading && ready && !error && result?.entries.length === 0 && <p>{t("client.downloads.thisFolderIsEmpty")}</p>}
      {result?.entries.map(file => <button type="button" className="download-file" key={file.path}
        disabled={!ready} onClick={event => { void choose(file, event); }}
        aria-label={t(file.directory ? "client.downloads.openFolder" : "client.downloads.download", { name: file.name })}>
        {file.directory ? <Folder size={21} /> : <Download size={21} />}<span>{file.name}</span>
        <ChevronRight size={17} /></button>)}
      {result?.truncated && <p>{t("client.downloads.onlyTheFirst500EntriesAreShown")}</p>}
    </div>
  </section>;
}
