import { displayText, displayError } from '../i18n/index';
import { useState } from 'react';
import { ArrowLeft, Download, Folder, Monitor } from 'lucide-react';
import { t, useLanguage } from '../i18n';
import { downloadConnectionLabel } from '../../../../shared/remote-chat/downloadConnection';
import { DownloadBrowser } from './DownloadBrowser';
import { DownloadCard } from './DownloadCard';
import { useDownloadTasks } from './useDownloadTasks';
import { useDownloadSelection } from '../../../../shared/downloads/useDownloadSelection';
import { DownloadBatchActions } from './DownloadBatchActions';
import { DownloadWorkspace } from './desktop/DownloadWorkspace';
import { useDesktopLayout } from '../useDesktopLayout';
import './styles.css';

export function DownloadManagerPage({ owner, onBack }: { owner: string; onBack: () => void }) {
  useLanguage();
  const desktop = useDesktopLayout();
  const { connection, tasks, error, busy, run, removeTasks } = useDownloadTasks(owner);
  const { selected, toggle, allSelected, toggleAll } = useDownloadSelection(tasks, owner);
  const [view, setView] = useState<'tasks' | 'project' | 'computer'>('tasks');
  if (view !== 'tasks' && connection) return <DownloadBrowser
    key={`${connection.deviceId}:${view}:${connection.threadId ?? connection.cwd ?? ''}`}
    connection={connection} scope={view} back={() => setView('tasks')} />;
  if (desktop) return <DownloadWorkspace tasks={tasks} owner={owner} busy={!!busy} error={error}
    run={run} removeTasks={removeTasks} onBack={onBack} allowShare sources={<>
      <button type="button" className="dw-button" disabled={!connection?.ready || !(connection.threadId || connection.cwd)}
        onClick={() => setView('project')}><Folder size={17} />{t('client.downloads.currentProject')}</button>
      <button type="button" className="dw-button" disabled={!connection?.ready}
        onClick={() => setView('computer')}><Monitor size={17} />{t('client.downloads.thisComputer')}</button>
    </>} />;
  return <section className="downloads-page">
    <header className="downloads-header"><button type="button" className="download-icon-button"
      aria-label={t("client.discovery.back")} onClick={onBack}><ArrowLeft size={22} /></button><h2>{t("client.downloads.downloads")}</h2></header>
    <div className="download-source-heading">
      <span>{t("client.mobile.addDownload")}</span>
      <div className="download-connection" role="status">
        <span aria-hidden className={`download-connection-dot${connection?.ready ? '' : ' is-offline'}`} />
        <span className="download-connection-name">{connection?.deviceName || t("client.mobile.noComputerConnected")}</span>
        {connection && <span>{displayText(downloadConnectionLabel(connection.mode))}</span>}
      </div>
    </div>
    <div className="download-sources">
      <button type="button" className="download-card" disabled={!connection?.ready || !(connection.threadId || connection.cwd)}
        onClick={() => setView('project')}><Folder size={24} /><strong>{t("client.downloads.currentProject")}</strong></button>
      <button type="button" className="download-card" disabled={!connection?.ready}
        onClick={() => setView('computer')}><Monitor size={24} /><strong>{t("client.downloads.thisComputer")}</strong></button>
    </div>
    {error && <p role="alert" className="download-notice">{displayError(error)}</p>}
    <div className="download-section-heading"><h3>{t("client.downloads.downloads.ea215a")}</h3>
      <DownloadBatchActions count={selected.size} total={tasks.length} allSelected={allSelected}
        busy={!!busy} toggleAll={toggleAll} remove={() => { void removeTasks([...selected]); }} />
      <small>{tasks.length}</small>
    </div>
    <div className="download-tasks">{tasks.map(task => <DownloadCard key={task.id} task={task} busy={!!busy}
      selected={selected.has(task.id)} toggleSelection={() => toggle(task.id)}
      connected={!!connection?.ready && connection.deviceId === task.source.deviceId}
      action={() => { void run(task); }} open={() => { void run(task, 'open'); }}
      share={() => { void run(task, 'share'); }}
      remove={() => { void run(task, 'remove'); }} />)}</div>
    {!tasks.length && <div className="download-empty"><Download size={38} /><h3>{t("client.downloads.noDownloadsYet")}</h3>
      <p>{t("client.downloads.browseFilesAboveOrDownloadFromAFilePreviewIn")}</p></div>}
  </section>;
}
