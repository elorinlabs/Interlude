import { displayError } from '../i18n/index';
import { Check, ChevronDown, Folder, Plus } from 'lucide-react';
import { t, useLanguage } from '../i18n';
import { AdaptiveSheet } from '../components/AdaptiveSheet';
import { useProjectSwitch, type ProjectSwitchProps } from '../../../../shared/remote-chat/client/useProjectSwitch';
import { ChatProjectPicker } from './ChatProjectPicker';
import './projectSwitch.css';
import { ProjectBrowserButton } from './projectBrowser/ProjectBrowserButton';

export function ChatProjectSwitch(props: ProjectSwitchProps) {
  useLanguage();
  const picker = useProjectSwitch(props);
  return <div className="chat-project-switch">
    <button type="button" className="chat-project-trigger" aria-label={t("client.chat.chooseProject")}
      aria-haspopup="dialog" aria-expanded={!!picker.screen} disabled={picker.disabled} onClick={picker.open}>
      <Folder size={16} aria-hidden="true" /><span>{picker.label || t("client.chat.noProjectSelected")}</span>
      <ChevronDown size={14} aria-hidden="true" />
    </button>
    <ProjectBrowserButton client={props.controller.guiTools.projectBrowser} cwd={picker.cwd}
      active={props.active} connected={props.state.ready && !props.state.workspaceBusy}
      className="chat-project-trigger chat-project-files-trigger" />
    {picker.screen === 'projects' && !picker.disabled && <AdaptiveSheet open title={t("client.chat.chooseProject")}
      width={400} onClose={picker.close}>
      <div className="chat-project-choices">
        {picker.loading && <p role="status" className="chat-muted">{t("client.projectBrowser.loading")}</p>}
        {!!picker.error && <div><p role="alert" className="chat-error">{displayError(picker.error)}</p>
          <button type="button" className="chat-button" onClick={picker.retry}>{t("client.terminal.retry")}</button></div>}
        <div className="chat-project-options chat-scroll">
          {!picker.loading && !picker.error && !picker.projects.length
            && <p className="chat-muted">{t("client.conversation.noProjectsYet")}</p>}
          {picker.projects.map(project => <button type="button" key={project.cwd} className="chat-project-option"
            aria-pressed={project.cwd === picker.cwd} onClick={() => picker.choose(project)}>
            <Folder size={18} aria-hidden="true" />
            <span><strong>{project.label}</strong><small>{project.cwd}</small></span>
            {project.cwd === picker.cwd && <Check size={18} aria-hidden="true" />}
          </button>)}
        </div>
        <button type="button" className="chat-button chat-project-create" onClick={picker.create}>
          <Plus size={18} aria-hidden="true" />{t("client.conversation.newProject")}</button>
      </div>
    </AdaptiveSheet>}
    {picker.screen === 'create' && !picker.disabled && <ChatProjectPicker cwd={picker.cwd}
      title={t("client.conversation.newProject")} load={props.controller.loadProjectDirectories} close={picker.close} choose={picker.choose} />}
  </div>;
}
