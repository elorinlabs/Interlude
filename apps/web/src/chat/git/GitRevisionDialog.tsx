import { displayText, displayError } from '../../i18n/index';
import { Modal, Radio } from 'antd';
import { useState } from 'react';
import type { GitResetMode } from '../../../../../shared/remote-chat/gitTypes';
import type { RemoteGit } from '../../../../../shared/remote-chat/useRemoteGit';
import { t } from '../../i18n';
import './gitRevision.css';
import { GIT_RESET_MODES } from '../../../../../shared/remote-chat/gitMenu';

export function GitRevisionDialog({ panel, connected }: { panel: RemoteGit; connected: boolean }) {
  const [mode, setMode] = useState<GitResetMode>('mixed');
  const prompt = panel.revisionAction;
  if (!prompt) return null;
  const resetting = prompt.action === 'reset';
  return <Modal open centered width={400} title={t(resetting ? "client.git.resetCurrentBranchToHere.f659aa" : "client.git.checkoutRevision.833b93")}
    className="git-revision-dialog" onCancel={panel.cancelRevisionAction} closable={!panel.busy}
    maskClosable={!panel.busy} keyboard={!panel.busy} cancelText={t("client.accounts.cancel")}
    cancelButtonProps={{ disabled: panel.busy, 'aria-label': t("client.accounts.cancel") }} confirmLoading={panel.busy}
    okText={t(resetting ? "client.git.resetBranch" : "client.git.checkOut")}
    okButtonProps={{ danger: resetting && mode === 'hard', disabled: !connected,
      'aria-label': t(resetting ? "client.git.resetBranch" : "client.git.checkOut") }}
    onOk={() => void panel.confirmRevisionAction(mode)}>
    <p className="git-revision-target"><code>{prompt.commit.slice(0, 12)}</code> · {prompt.subject}</p>
    {resetting ? <>
      <p>{t("client.git.moveBranchToTheSelectedCommit", { branch: prompt.branch ?? '' })}</p>
      <Radio.Group value={mode} disabled={panel.busy} onChange={event => setMode(event.target.value)}
        className="git-reset-modes" aria-label={t("client.git.resetMode")}>
        {GIT_RESET_MODES.map(item => <Radio key={item.value} value={item.value}>
          <strong>{displayText(item.label)}</strong><small>{displayText(item.description)}</small>
        </Radio>)}
      </Radio.Group>
    </> : <p>{t("client.git.checkOutThisCommitWithADetachedHeadTheCurrent")}</p>}
    {panel.error && <p role="alert">{displayError(panel.error)}</p>}
  </Modal>;
}
