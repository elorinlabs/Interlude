import { useEffect, useState } from 'react';
import { Dropdown, Tooltip } from 'antd';
import { ChevronDown, Plus, Settings, Server } from 'lucide-react';
import { SshConnectionDialog } from './SshConnectionDialog';
import { SshQuickConnectDialog } from './SshQuickConnectDialog';
import { sshLabel, type SshProfile } from './sshProfiles';
import type { SshApi } from './ssh';
import type { TerminalInfo } from './types';
import { displayText as t } from '../localization/messages';
import './ssh.css';
import { useSshProfiles } from './useSshProfiles';

export function SshMenu({ api, projectCwd, adopt, close, disabled, className }: {
  api: SshApi; projectCwd: string; adopt: (info: TerminalInfo) => void;
  close: (id: string) => Promise<void>; disabled: boolean; className: string;
}) {
  const { profiles, refresh, loading, error } = useSshProfiles(api.profiles, false);
  const [dialog, setDialog] = useState<{ profile?: SshProfile; manage: boolean }>();
  useEffect(() => { setDialog(undefined); }, [api, projectCwd]);
  return <>
    <Dropdown trigger={['click']} overlayClassName="ssh-launch-menu" onOpenChange={open => {
      if (open) void refresh();
    }} menu={{ items: [
      { key: 'new', label: t('client.ssh.new'), icon: <Plus size={15} />, disabled },
      ...(error ? [{ key: 'error', label: t(error), disabled: true }] : []),
      ...profiles.map(profile => ({ key: profile.id, label: profile.name || sshLabel(profile),
        icon: <Server size={15} />, disabled: disabled || loading || !!error })),
      { type: 'divider' },
      { key: 'settings', label: t('client.ssh.manage'), icon: <Settings size={15} />, disabled },
    ], onClick: ({ key }) => setDialog({ profile: profiles.find(profile => profile.id === key),
      manage: key !== 'new' }) }}>
      <Tooltip title={t('client.ssh.menu')} open={dialog ? false : undefined} styles={{ root: { maxWidth: 400 } }}>
        <button type="button" className={className} aria-label={t('client.ssh.menu')}><ChevronDown size={17} /></button>
      </Tooltip>
    </Dropdown>
    {dialog?.profile && <SshQuickConnectDialog api={api} profile={dialog.profile} projectCwd={projectCwd}
      close={() => { setDialog(undefined); void refresh(); }} connected={adopt} dispose={close} />}
    {dialog && !dialog.profile && <SshConnectionDialog api={api} manage={dialog.manage} projectCwd={projectCwd}
      close={() => setDialog(undefined)} connected={adopt} dispose={close} changed={() => void refresh()} />}
  </>;
}
