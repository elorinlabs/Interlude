import { useEffect, useState } from 'react';
import { Alert, Button, Input, Modal } from 'antd';
import { displayText as t } from '../localization/messages';
import { remoteErrorText } from '../localization/errors';
import type { useSshFileEditor } from './useSshFileEditor';

type Editor = ReturnType<typeof useSshFileEditor>;

export function SshFileEditor({ editor }: { editor: Editor }) {
  const [confirmClose, setConfirmClose] = useState(false);
  const [saved, setSaved] = useState(false);
  const document = editor.document;
  useEffect(() => { setSaved(false); setConfirmClose(false); }, [document?.entry.path]);
  useEffect(() => {
    if (!editor.dirty) return;
    const preventLoss = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', preventLoss);
    return () => window.removeEventListener('beforeunload', preventLoss);
  }, [editor.dirty]);
  if (!document) return null;
  const close = () => {
    if (editor.busy) return;
    if (editor.dirty) setConfirmClose(true); else editor.close();
  };
  const save = async () => { setSaved(false); if (await editor.save()) setSaved(true); };
  return <>
    <Modal open width={900} className="ssh-file-editor" title={document.entry.name}
      onCancel={close} maskClosable={false} keyboard={!editor.busy && !confirmClose} closable={!editor.busy}
      footer={<div className="ssh-editor-actions">
        <Button disabled={editor.busy} onClick={close}>{t('client.ssh.closeFile')}</Button>
        <Button type="primary" loading={editor.busy} disabled={!editor.dirty} onClick={() => void save()}>
          {t('client.ssh.saveFile')}</Button>
      </div>}>
      <Input.TextArea className="ssh-editor-content" aria-label={t('client.ssh.fileContent')}
        value={document.text} readOnly={editor.busy} spellCheck={false} autoCapitalize="off" autoCorrect="off"
        onChange={event => { setSaved(false); editor.changeText(event.target.value); }}
        onKeyDown={event => {
          if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
            event.preventDefault(); if (!editor.busy && editor.dirty) void save();
          }
        }} />
      {editor.error && <Alert type="error" role="alert" message={remoteErrorText(editor.error)} />}
      {saved && !editor.dirty && <Alert type="success" role="status" message={t('client.ssh.fileSaved')} />}
    </Modal>
    <Modal open={confirmClose} width={400} title={t('client.ssh.unsavedTitle')}
      onCancel={() => setConfirmClose(false)} onOk={() => { setConfirmClose(false); editor.close(); }}
      okText={t('client.ssh.discardChanges')} cancelText={t('client.ssh.cancel')} okButtonProps={{ danger: true }}>
      <p className="ssh-conflict-copy">{t('client.ssh.unsavedHint')}</p>
    </Modal>
  </>;
}
