import { Alert, Button, Input, Modal } from 'antd';
import { displayText as t } from '../localization/messages';
import { remoteErrorText } from '../localization/errors';
import { validSshName } from './useSshFiles';
import type { SshFileActions, SshFilesState } from './useSshFileActions';

export function SshFileDialogs({ files, actions }: { files: SshFilesState; actions: SshFileActions }) {
  const { prompt, conflict } = actions;
  const deleting = prompt?.kind === 'delete';
  const title = prompt?.kind === 'createFolder' ? 'client.ssh.newFolder' : 'client.ssh.newFile';
  return <>
    {prompt && <Modal open width={400}
      title={t(prompt.kind === 'rename' || deleting ? `client.ssh.${prompt.kind}` : title)}
      onCancel={() => actions.setPrompt(undefined)} onOk={() => void actions.confirm()} confirmLoading={files.busy}
      closable={!files.busy} maskClosable={!files.busy} keyboard={!files.busy}
      okText={t(deleting ? 'client.ssh.delete' : 'client.ssh.confirm')} cancelText={t('client.ssh.cancel')}
      cancelButtonProps={{ disabled: files.busy }}
      okButtonProps={{ danger: deleting, disabled: !deleting && !validSshName(prompt.name) }}>
      {deleting ? <>
        <p>{t('client.ssh.deleteConfirm', { name: prompt.name })}</p>
        <p>{t(prompt.entry?.directory ? 'client.ssh.deleteFolderHint' : 'client.ssh.deleteFileHint')}</p>
      </> : <Input autoFocus aria-label={t('client.ssh.fileName')} value={prompt.name} maxLength={255}
        disabled={files.busy} onChange={event => actions.setPrompt({ ...prompt, name: event.target.value })}
        onPressEnter={() => void actions.confirm()} />}
      {files.error && <Alert type="error" role="alert" message={remoteErrorText(files.error)} />}
    </Modal>}
    {conflict && <Modal open width={400} title={t('client.ssh.uploadConflictTitle')}
      onCancel={() => actions.chooseConflict(undefined)}
      footer={<div className="ssh-conflict-actions">
        <Button onClick={() => actions.chooseConflict(undefined)}>{t('client.ssh.cancel')}</Button>
        <Button danger onClick={() => actions.chooseConflict('overwrite')}>{t('client.ssh.overwrite')}</Button>
        <Button type="primary" onClick={() => actions.chooseConflict('rename')}>{t('client.ssh.keepBoth')}</Button>
      </div>}>
      <p className="ssh-conflict-copy">{t('client.ssh.uploadConflictHint', { name: conflict })}</p>
    </Modal>}
  </>;
}
