import { useRef, useState, type ReactNode } from 'react';
import { Tooltip } from 'antd';
import { ArrowRight, ArrowUp, Home, Upload } from 'lucide-react';
import { displayText as t } from '../localization/messages';
import { sshParent } from './useSshFiles';

export function SshProjectToolbar({ path, disabled, navigate, upload, pickUpload, actions }: {
  path: string; disabled: boolean;
  navigate: (path: string) => void; upload?: (files: FileList) => void; pickUpload?: () => void; actions: ReactNode;
}) {
  const [address, setAddress] = useState<{ path: string; value: string }>();
  const input = useRef<HTMLInputElement>(null);
  const open = (value: string) => { setAddress(undefined); navigate(value); };
  const buttons = [
    { key: 'client.ssh.home', Icon: Home, click: () => open('.') },
    { key: 'client.ssh.parent', Icon: ArrowUp, click: () => open(sshParent(path)), disabled: path === '/' },
    { key: 'client.ssh.upload', Icon: Upload, click: () => pickUpload ? pickUpload() : input.current?.click() },
  ];
  return <div className="ssh-project-toolbar">
    <div className="ssh-project-actions">
      {buttons.map(({ key, Icon, click, disabled: unavailable }) =>
        <Tooltip key={key} title={t(key)} styles={{ root: { maxWidth: 400 } }}>
          <button type="button" aria-label={t(key)}
            disabled={disabled || unavailable} onClick={click}><Icon size={16} /></button>
        </Tooltip>)}
      {actions}
      {upload && <input type="file" hidden multiple ref={input} onChange={event => {
        if (event.currentTarget.files?.length) upload(event.currentTarget.files);
        event.currentTarget.value = '';
      }} />}
    </div>
    <form className="ssh-project-path" onSubmit={event => {
      event.preventDefault(); open(address?.path === path ? address.value : path);
    }}>
      <input aria-label={t('client.ssh.path')} value={address?.path === path ? address.value : path}
        autoCapitalize="none" autoCorrect="off" spellCheck={false} enterKeyHint="go"
        disabled={disabled} onChange={event => setAddress({ path, value: event.target.value })} />
      <Tooltip title={t('client.ssh.go')} styles={{ root: { maxWidth: 400 } }}>
        <button type="submit" aria-label={t('client.ssh.go')} disabled={disabled}><ArrowRight size={16} /></button>
      </Tooltip>
    </form>
  </div>;
}
