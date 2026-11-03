import { useId } from 'react';
import { Checkbox, Input } from 'antd';
import type { SshX11 } from './ssh';
import { displayText as t } from '../localization/messages';

export function SshX11Field({ value, onChange, disabled }: {
  value?: SshX11; onChange?: (value: SshX11 | undefined) => void; disabled?: boolean;
}) {
  const displayId = useId();
  return <div className="ssh-x11-field">
    <Checkbox checked={!!value} disabled={disabled} onChange={event => onChange?.(event.target.checked ? {} : undefined)}>
      {t('client.ssh.x11Forwarding')}
    </Checkbox>
    {value && <>
      <label htmlFor={displayId}>{t('client.ssh.x11Display')}</label>
      <Input id={displayId} value={value.display ?? ''} disabled={disabled} maxLength={256}
        placeholder={t('client.ssh.x11DisplayPlaceholder')}
        onChange={event => onChange?.({ display: event.target.value })} />
      <p className="ssh-hint">{t('client.ssh.x11Hint')}</p>
    </>}
  </div>;
}
