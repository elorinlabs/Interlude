import { useEffect, useRef, useState, type AriaAttributes } from 'react';
import { Button, Input } from 'antd';
import { FileUp } from 'lucide-react';
import { displayText as t } from '../localization/messages';
import { MAX_PRIVATE_KEY_BYTES, readSshPrivateKey } from './sshPrivateKey';

interface Props extends Pick<AriaAttributes, 'aria-describedby' | 'aria-invalid' | 'aria-required'> {
  id?: string; value?: string; onChange?: (value: string) => void; disabled: boolean;
}

export function SshPrivateKeyInput({ id, value, onChange, disabled, ...accessibility }: Props) {
  const picker = useRef<HTMLInputElement>(null);
  const request = useRef(0);
  const [reading, setReading] = useState(false);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  // Form resets remount this control; late reads must not populate another connection's credentials.
  useEffect(() => () => { request.current += 1; }, []);
  useEffect(() => {
    if (disabled) { request.current += 1; setReading(false); }
  }, [disabled]);
  const importFile = async (file?: File) => {
    if (!file || disabled) return;
    const current = ++request.current;
    setReading(true); setError('');
    try {
      const key = await readSshPrivateKey(file);
      if (current !== request.current) return;
      onChange?.(key); setFileName(file.name);
    } catch (failure) {
      if (current === request.current) {
        setError(failure instanceof Error ? failure.message : 'client.ssh.keyFileReadFailed');
      }
    } finally { if (current === request.current) setReading(false); }
  };
  const edit = (key: string) => {
    request.current += 1; setReading(false); setFileName(''); setError(''); onChange?.(key);
  };
  return <>
    <div className="ssh-key-editor">
      <div className="ssh-key-toolbar">
        <Button type="text" size="small" icon={<FileUp size={15} />} disabled={disabled} loading={reading}
          onClick={() => picker.current?.click()}>{t('client.ssh.importKeyFile')}</Button>
        {fileName && <span className="ssh-key-imported" role="status">
          {t('client.ssh.keyFileImported', { name: fileName })}</span>}
      </div>
      <input ref={picker} type="file" hidden disabled={disabled} aria-label={t('client.ssh.importKeyFile')}
        onChange={event => {
          const file = event.target.files?.[0];
          event.target.value = ''; void importFile(file);
        }} />
      <Input.TextArea {...accessibility} id={id} className="ssh-private-key" rows={4} autoComplete="off"
        value={value} onChange={event => edit(event.target.value)} disabled={disabled}
        aria-invalid={!!error || accessibility['aria-invalid']}
        aria-describedby={[accessibility['aria-describedby'], error && id ? `${id}-import-error` : '']
          .filter(Boolean).join(' ') || undefined} maxLength={MAX_PRIVATE_KEY_BYTES}
        placeholder={t('client.ssh.keyPlaceholder')} />
    </div>
    {error && <p id={id ? `${id}-import-error` : undefined} className="ssh-key-import-error" role="alert">
      {t(error)}</p>}
  </>;
}
