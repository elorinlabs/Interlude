import { Download, RotateCw } from 'lucide-react';
import type { HelpCopy } from './copy';
import type { HelpError, HelpStatus } from './types';
import type { useHelpSetup } from './useHelpSetup';
import styles from './helpAssistant.module.less';

export function HelpSetupNotice(props: {
  status?: HelpStatus; error?: HelpError; checking: boolean; copy: HelpCopy;
  setup: ReturnType<typeof useHelpSetup>; refresh: () => Promise<void>; onSelectAccount: () => void;
}) {
  const { status, error, copy, setup } = props;
  const busy = Boolean(setup.phase);
  const prerequisite = status && status !== 'ready' ? copy.errors[status] : undefined;
  const setupError = setup.error && status !== 'ready' ? copy.setupErrors[setup.error] : undefined;
  const notice = setupError ?? prerequisite ?? (error && copy.errors[error]);
  if (!notice && !busy) return null;
  return <div className={styles.notice} role={busy ? 'status' : 'alert'}>
    {setup.phase ? <p>{copy.setupPhases[setup.phase]}</p> : <p>{notice}</p>}
    {setup.phase && <p className={styles.setupProgress}>
      <progress max={100} value={setup.progress} aria-label={copy.setupPhases[setup.phase]} />
      {setup.progress !== undefined && setup.phase === 'downloading' && <span>{setup.progress}%</span>}
    </p>}
    <div>
      {status === 'installRequired' && <button type="button" className={styles.primary} disabled={busy}
        onClick={() => void setup.run('install')}><Download size={14} />{copy.install}</button>}
      {status === 'initializeRequired' && <button type="button" className={styles.primary} disabled={busy}
        onClick={() => void setup.run('initialize')}>{copy.initialize}</button>}
      {status === 'accountRequired' && <button type="button" className={styles.primary} disabled={busy}
        onClick={props.onSelectAccount}>{copy.selectAccount}</button>}
      <button type="button" disabled={busy || props.checking} onClick={() => void props.refresh()}>
        <RotateCw size={13} />{copy.retry}</button>
    </div>
  </div>;
}
