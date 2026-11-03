import { Check, Eye } from 'lucide-react';
import { displayText as t } from '../localization/messages';

export function SshHiddenFilesMenuItem({ hidden, disabled, toggle }: {
  hidden: boolean; disabled: boolean; toggle: () => void;
}) {
  return <button type="button" role="menuitemcheckbox" aria-checked={hidden} disabled={disabled} onClick={toggle}>
    <Eye size={16} /><span>{t('client.ssh.hidden')}</span>{hidden && <Check size={16} />}
  </button>;
}
