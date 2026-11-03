import { uiText } from "../../../i18n/uiText";
import { remoteErrorText } from "../../../../../../shared/localization/errors";
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';
import type { GuiAccountsClient, SelectableGuiAccount } from '../../../../../../shared/remote-chat/guiAccounts';
import { useGuiAccounts } from '../../../../../../shared/remote-chat/client/useGuiAccounts';
import { maskAccountEmail } from '../../../utils/accountPrivacy';
import { GuiAccountMenu } from '../GuiAccountMenu';
import { GuiAccountList } from '../GuiAccountList';
import { RemoteAccountSummary } from './RemoteAccountSummary';
import type { GuiComputerNavigation } from './types';
import styles from '../ProxyAccountPicker.module.less';

const ACCOUNT_REFRESH_MS = 60_000;

export function RemoteAccountPicker({ active, ready, client, computers, privacyMode }: {
  active: boolean; ready: boolean; client: GuiAccountsClient; computers: GuiComputerNavigation; privacyMode: boolean;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const accounts = useGuiAccounts(client, ready && active, ACCOUNT_REFRESH_MS);
  const selection = accounts.snapshot?.selection;
  const current = accounts.snapshot?.choices.find((choice) => choice.kind === selection?.kind && choice.id === selection.id);
  const name = current ? privacyMode && current.kind === 'account' ? maskAccountEmail(current.name) : current.name
    : uiText("client.conversation.chooseGuiAccount");
  const disabled = !ready || accounts.loading || Boolean(accounts.saving) || !accounts.snapshot?.running;
  useEffect(() => { if (!active) setOpen(false); }, [active]);
  const select = async (kind: SelectableGuiAccount['kind'], id: string) => {
    if (await accounts.select({ kind, id })) { setOpen(false); trigger.current?.focus(); }
  };
  const choices = accounts.snapshot?.choices.map((choice) => ({ ...choice,
    // Older computers only send a full description; render it once without adding empty quota fields.
    accountDetails: choice.kind === 'account' && choice.plan !== undefined
      && choice.primaryRemainingPercent !== undefined && choice.secondaryRemainingPercent !== undefined
      ? { plan: choice.plan, primaryRemainingPercent: choice.primaryRemainingPercent,
        secondaryRemainingPercent: choice.secondaryRemainingPercent } : undefined,
    selected: selection?.kind === choice.kind && selection.id === choice.id, disabled: !choice.available })) ?? [];
  const panel = (devicePicker: ReactNode) => <GuiAccountList choices={choices} devicePicker={devicePicker}
    disabled={disabled} loading={accounts.loading || Boolean(accounts.saving)}
    onSelectAccount={(id) => { void select('account', id); }}
    onSelectAggregate={(id) => { void select('aggregate', id); }}
    onSelectProvider={(id) => { void select('provider', id); }} footer={<>
      {!ready && <p className={styles.hint}>{uiText("client.chat.connectToYourComputerToSwitchAccounts")}</p>}
      {ready && accounts.snapshot && !accounts.snapshot.running
        && <p className={styles.hint}>{uiText("client.workspaceActions.startTheLocalProxyOnThisComputerFirst")}</p>}
      {accounts.error && <p className={styles.error} role="alert">{remoteErrorText(accounts.error)}</p>}
      <button type="button" className={styles.settings} aria-label={uiText("client.workspaceActions.refreshAccountList")}
        disabled={!ready || accounts.loading || Boolean(accounts.saving)} onClick={accounts.refresh}>
        <RefreshCw size={17} />{uiText("client.workspaceActions.refreshAccounts")}</button>
    </>} />;
  return <GuiAccountMenu active={active} open={open} trigger={trigger} name={name} computers={computers}
    busy={Boolean(accounts.saving)} accounts={panel}
    onOpenChange={(next) => { setOpen(next); if (next && ready) accounts.refresh(); }}
    summary={<RemoteAccountSummary name={name} current={current} ready={ready}
      running={accounts.snapshot?.running} />} />;
}
