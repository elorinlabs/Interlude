import { Checkbox } from 'antd';
import type { RemoteGit } from '../../../../../shared/remote-chat/useRemoteGit';
import { t } from '../../i18n';

export function GitCommitForm({ panel }: { panel: RemoteGit }) {
  const count = Object.keys(panel.selected).length;
  return <div className="git-commit-form">
    <textarea aria-label={t("client.git.commitMessage")} maxLength={4000} value={panel.message}
      placeholder={t(panel.autoMessage ? "client.gitMessage.generateAMessageFromSelectedFilesWhenCommitting" : "client.gitMessage.writeACommitMessageOrPressTabToGenerateWith")}
      disabled={panel.busy || panel.autoMessage} onChange={event => panel.setMessage(event.target.value)}
      onKeyDown={event => {
        if (event.key !== 'Tab' || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey
          || event.nativeEvent.isComposing || panel.message.trim() || !panel.canGenerateMessage) return;
        event.preventDefault();
        void panel.generateMessage();
      }} />
    <div className="git-message-options">
      <Checkbox checked={panel.autoMessage} disabled={panel.busy || panel.settingsBusy}
        onChange={event => void panel.setAutoMessage(event.target.checked)}>{t("client.gitMessage.generateCommitMessageAutomatically")}</Checkbox>
      {!panel.autoMessage && !panel.message.trim() && <button type="button" className="git-generate-message"
        disabled={!panel.canGenerateMessage} onClick={() => void panel.generateMessage()}>{t("client.gitMessage.generateWithAi")}</button>}
    </div>
    {panel.generatingMessage && <p role="status">{t("client.gitMessage.generatingCommitMessage")}</p>}
    <div className="git-commit-actions">
      <button type="button" className="git-submit" disabled={!panel.canCommit}
        onClick={() => void panel.commit()}>{t("client.git.commitFiles", { count })}</button>
      <button type="button" className="git-submit" disabled={!panel.canCommitAndPush}
        onClick={() => void panel.commit({ push: true })}>{t("client.git.commitAndPush")}</button>
    </div>
  </div>;
}
