import { useMemo, useState } from 'react';
import { Button, Modal, Popconfirm, Spin } from 'antd';
import { ArrowLeft, ArrowRight, Check, ChevronDown, ChevronUp, Redo2, Undo2 } from 'lucide-react';
import type { RemoteGit } from '../../../../../shared/remote-chat/useRemoteGit';
import type { GitConflict } from '../../../../../shared/remote-chat/gitTypes';
import { createMergeModel, containsConflictMarkers } from '../../../../../shared/git-merge/model';
import { useMergeEditors } from '../../../../../shared/git-merge/useMergeEditors';
import { displayError, t } from '../../i18n';
import { useGitTheme } from './gitTheme';
import './gitConflict.css';

export function GitConflictEditor({ panel, connected }: { panel: RemoteGit; connected: boolean }) {
  const theme = useGitTheme();
  return <Modal open centered width="calc(100vw - 48px)" footer={null} className="git-merge-modal"
    styles={{ body: theme }} title={t('client.gitConflict.title')} maskClosable={false} keyboard={false}
    closable={false}>
    {panel.conflict ? <MergeContent key={panel.conflict.version} conflict={panel.conflict}
      panel={panel} connected={connected} /> : <div className="gm-loading">
      <code>{panel.conflictPath}</code>
      {panel.busy && <Spin />}
      {panel.error && <p role="alert">{displayError(panel.error)}</p>}
      <Button disabled={panel.busy} onClick={panel.closeConflict}>{t('client.projectBrowser.close')}</Button>
      {!panel.busy && <Button disabled={!connected} onClick={() => void panel.openConflict(panel.conflictPath!)}>
        {t('client.gitConflict.reload')}</Button>}
    </div>}
  </Modal>;
}

function MergeContent({ conflict, panel, connected }: {
  conflict: GitConflict; panel: RemoteGit; connected: boolean;
}) {
  const model = useMemo(() => createMergeModel(conflict), [conflict]);
  const [text, setText] = useState(model.result.text);
  const [remaining, setRemaining] = useState(model.blocks.length);
  const [dirty, setDirty] = useState(false);
  const disabled = panel.busy || !connected;
  const rebasing = panel.changes?.integration?.kind === 'rebase';
  const labels = {
    left: t(rebasing ? 'client.gitConflict.rebaseLeft' : 'client.gitConflict.left'),
    right: t(rebasing ? 'client.gitConflict.rebaseRight' : 'client.gitConflict.right'),
    result: t('client.gitConflict.result'),
  };
  const editor = useMergeEditors({ model, path: conflict.path, disabled, label: side => labels[side],
    missing: [...(conflict.ours === null ? ['left' as const] : []),
      ...(conflict.theirs === null ? ['right' as const] : [])],
    arrowLabel: (side, id) => t(side === 'left' ? 'client.gitConflict.useLeftBlock' : 'client.gitConflict.useRightBlock',
      { count: id + 1 }),
    onChange: (value, count) => { setText(value); setRemaining(count);
      if (value !== model.result.text || count !== model.blocks.length) setDirty(true); },
  });
  const total = model.blocks.length;
  const saveDisabled = disabled || remaining > 0 || containsConflictMarkers(text, conflict.markerSize);
  const cancel = <Button disabled={panel.busy} aria-label={t('client.projectBrowser.close')}
    onClick={dirty ? undefined : panel.closeConflict}>
    {t('client.projectBrowser.close')}</Button>;
  return <div className="git-merge" aria-busy={panel.busy}>
    <div className="gm-heading"><code>{conflict.path}</code>
      <span role="status">{t('client.gitConflict.remaining', { count: remaining })}</span></div>
    <div className="gm-toolbar" role="toolbar" aria-label={t('client.gitConflict.tools')}>
      <Button aria-label={t('client.gitConflict.previous')} onClick={() => editor.focus((editor.active + total - 1) % total)}>
        <ChevronUp size={16} /></Button>
      <span>{editor.active + 1} / {total}</span>
      <Button aria-label={t('client.gitConflict.next')} onClick={() => editor.focus((editor.active + 1) % total)}>
        <ChevronDown size={16} /></Button>
      <Button disabled={disabled || conflict.ours === null} onClick={() => editor.choose(editor.active, 'left')}>
        <ArrowRight size={16} />{t('client.gitConflict.useLeft')}</Button>
      <Button disabled={disabled || conflict.theirs === null} onClick={() => editor.choose(editor.active, 'right')}>
        <ArrowLeft size={16} />{t('client.gitConflict.useRight')}</Button>
      <Button disabled={disabled || conflict.ours === null || conflict.theirs === null}
        onClick={() => editor.choose(editor.active, 'both')}>
        {t('client.gitConflict.useBoth')}</Button>
      <Button disabled={disabled} onClick={() => editor.choose(editor.active, 'manual')}>
        <Check size={16} />{t('client.gitConflict.markBlock')}</Button>
      <Button disabled={disabled} aria-label={t('client.projectBrowser.undo')} onClick={editor.undo}><Undo2 size={16} /></Button>
      <Button disabled={disabled} aria-label={t('client.projectBrowser.redo')} onClick={editor.redo}><Redo2 size={16} /></Button>
    </div>
    <div className="gm-panes">
      {(['left', 'result', 'right'] as const).map(side => <section key={side} className={`gm-pane gm-${side}`}>
        <header>{labels[side]}{side !== 'result' && conflict[side === 'left' ? 'ours' : 'theirs'] === null
          && <small>{t('client.gitConflict.deleted')}</small>}</header>
        <div ref={editor[side]} className="gm-editor" />
      </section>)}
    </div>
    <p className="gm-hint">{t('client.gitConflict.hint')}</p>
    {panel.error && <p role="alert" className="gm-error">{displayError(panel.error)}</p>}
    {!connected && <p role="alert" className="gm-error">{t('client.git.connectToYourComputerToUseGit')}</p>}
    <div className="gm-footer">
      <Popconfirm title={t('client.gitConflict.reloadConfirm')} overlayStyle={{ maxWidth: 400 }}
        onConfirm={() => void panel.openConflict(conflict.path)} disabled={disabled}
        okText={t('client.gitConflict.reload')} cancelText={t('client.accounts.cancel')}>
        <Button disabled={disabled}>{t('client.gitConflict.reload')}</Button>
      </Popconfirm>
      <div className="gm-footer-actions">
        {dirty ? <Popconfirm title={t('client.gitConflict.closeConfirm')} overlayStyle={{ maxWidth: 400 }}
          onConfirm={panel.closeConflict} okText={t('client.projectBrowser.close')} cancelText={t('client.accounts.cancel')}
          cancelButtonProps={{ 'aria-label': t('client.accounts.cancel') }}>
          {cancel}</Popconfirm> : cancel}
        {(conflict.ours === null || conflict.theirs === null) && <Popconfirm
          title={t('client.gitConflict.deleteConfirm')} overlayStyle={{ maxWidth: 400 }}
          okText={t('client.gitConflict.keepDeletion')} cancelText={t('client.accounts.cancel')}
          onConfirm={() => void panel.saveConflict(null)}>
          <Button danger disabled={disabled}>{t('client.gitConflict.keepDeletion')}</Button>
        </Popconfirm>}
        <Button type="primary" loading={panel.busy} disabled={saveDisabled}
          onClick={() => void panel.saveConflict(text.replace(/\n/g, model.lineEnding))}>
          {t('client.gitConflict.save')}</Button>
      </div>
    </div>
  </div>;
}
