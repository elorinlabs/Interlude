import { displayText, displayError } from '../../i18n/index';
import { Input, Modal } from 'antd';
import { useState } from 'react';
import type { RemoteGit } from '../../../../../shared/remote-chat/useRemoteGit';
import { t } from '../../i18n';

const ACTION_LABELS = { commit: "client.git.commitThisFile", rollback: "client.git.rollBackFiles", delete: "client.git.deleteFile" };

export function GitFileActionDialog({ panel, connected }: { panel: RemoteGit; connected: boolean }) {
  const [message, setMessage] = useState(panel.message);
  const prompt = panel.fileAction;
  if (!prompt) return null;
  const committing = prompt.action === 'commit';
  const multiple = prompt.files.length > 1;
  const title = committing && multiple ? t("client.git.commitFiles", { count: prompt.files.length })
    : displayText(ACTION_LABELS[prompt.action]);
  const confirmText = t(committing ? "client.mobile.submit" : prompt.action === 'rollback' ? "client.git.rollBack" : "client.mobile.confirmDeletion");
  return <Modal open centered width={400} title={title}
    className="git-file-action-dialog" onCancel={panel.cancelFileAction} closable={!panel.busy}
    maskClosable={!panel.busy} keyboard={!panel.busy} cancelText={t("client.accounts.cancel")}
    cancelButtonProps={{ disabled: panel.busy, 'aria-label': t("client.accounts.cancel") }} confirmLoading={panel.busy}
    okText={confirmText}
    okButtonProps={{ danger: !committing, disabled: !connected || (committing && !message.trim()),
      'aria-label': confirmText }}
    onOk={() => void panel.confirmFileAction(message)}>
    <ul className="git-action-file-list">{prompt.files.map(file => <li key={file.path}>{file.path}</li>)}</ul>
    {committing ? <Input.TextArea autoFocus aria-label={t(multiple ? "client.git.commitMessage" : "client.git.commitMessageForThisFile")}
      placeholder={t("client.git.writeACommitMessage")}
      maxLength={4000} rows={3} value={message} disabled={panel.busy}
      onChange={event => setMessage(event.target.value)} />
      : <p>{t(prompt.action === 'rollback'
        ? "client.git.discardAllUncommittedChangesInTheseFilesAndDeleteNewly"
        : "client.git.deleteTheseFilesFromTheProjectThisCannotBeUndone")}</p>}
    {panel.error && <p role="alert" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
      {displayError(panel.error)}</p>}
  </Modal>;
}
