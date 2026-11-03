import { displayError } from '../i18n/index';
import { t, useLanguage } from '../i18n';
import { Folder, ChevronRight } from 'lucide-react';
import { AdaptiveSheet } from '../components/AdaptiveSheet';
import { directoryProject, type ProjectPickerProps } from '../../../../shared/remote-chat/projectDirectories';
import { useProjectDirectories } from '../../../../shared/remote-chat/client/useProjectDirectories';

export function ChatProjectPicker(props: ProjectPickerProps) {
  useLanguage();
  const { result, loading, error, browse, retry } = useProjectDirectories(props);
  return <AdaptiveSheet open title={props.title ?? t("client.chat.chooseProject")} width={400} onClose={props.close}>
    <div className="chat-settings chat-project-picker">
      <p className="chat-muted chat-project-path">{result?.directory || t("client.downloads.thisComputer")}</p>
      <div className="chat-row">
        <button type="button" className="chat-button" disabled={loading} onClick={() => browse('')}>{t("client.downloads.thisComputer")}</button>
        {result?.parent != null && <button type="button" className="chat-button" disabled={loading}
          onClick={() => browse(result.parent ?? '')}>{t("client.downloads.goBack")}</button>}
      </div>
      {loading && <p role="status" className="chat-muted">{t("client.downloads.readingFolder")}</p>}
      {!!error && <div><p role="alert" className="chat-error">{displayError(error)}</p>
        <button type="button" className="chat-button" onClick={retry}>{t("client.terminal.retry")}</button></div>}
      <div className="chat-project-folders chat-scroll">
        {result?.entries.map((entry) => <button type="button" key={entry.path} className="chat-thread"
          aria-label={entry.name} disabled={loading} onClick={() => browse(entry.path)}>
          <Folder size={21} /><span className="chat-grow chat-ellipsis">{entry.name}</span><ChevronRight size={18} />
        </button>)}
        {!loading && !error && !result?.entries.length && <p className="chat-muted">{t("client.chat.noSubfoldersHere")}</p>}
        {result?.truncated && <p className="chat-muted">{t("client.chat.onlySomeFoldersAreShown")}</p>}
      </div>
      <button type="button" className="chat-button chat-primary" disabled={loading || !result?.directory}
        onClick={() => { if (result?.directory) props.choose(directoryProject(result.directory)); }}>{t("client.chat.chooseThisFolder")}</button>
    </div>
  </AdaptiveSheet>;
}
