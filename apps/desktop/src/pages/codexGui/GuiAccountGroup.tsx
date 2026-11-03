import { uiText } from "../../i18n/uiText";
import { Check, Server } from 'lucide-react';
import { ProxyAccountDetails, type ProxyAccountDetailsProps } from './ProxyAccountDetails';
import styles from './ProxyAccountPicker.module.less';

export interface GuiAccountChoice {
  kind: 'account' | 'provider' | 'aggregate';
  id: string; name: string; detail: string; selected: boolean; disabled?: boolean;
  accountDetails?: ProxyAccountDetailsProps; searchDetail?: string;
}

export function GuiAccountGroup({ choices, onSelect, disabled }: {
  choices: GuiAccountChoice[]; onSelect: (choice: GuiAccountChoice) => void; disabled: boolean;
}) {
  return <section className={styles.group} aria-label={uiText("client.workspaceSettings.accounts")}>
    {choices.length ? choices.map((choice) => <button key={`${choice.kind}:${choice.id}`} type="button"
      className={`${styles.option} ${choice.selected ? styles.selected : ''}`}
      aria-pressed={choice.selected} disabled={disabled || choice.disabled}
      onClick={() => { if (!choice.selected) onSelect(choice); }}>
      <span className={`${styles.avatar} ${choice.kind !== 'account' ? styles.providerAvatar : ''}`}
        role="img" aria-label={choice.kind !== 'account' ? uiText("client.app.thirdPartyProvider") : uiText("client.mobile.officialAccounts")}>
        {choice.kind !== 'account' ? <Server size={16} aria-hidden="true" />
        : Array.from(choice.name.trim())[0]?.toUpperCase() || '?'}</span>
      <span className={styles.accountBody}>
        <span className={styles.optionName} title={choice.name}>{choice.name}</span>
        {choice.kind === 'account' && choice.accountDetails ? <ProxyAccountDetails {...choice.accountDetails} />
          : choice.detail && <small>{choice.detail}</small>}
        {choice.disabled && <small>{uiText("client.chat.thisAccountIsUnavailable")}</small>}
      </span>
      <span className={styles.selectionMark} aria-hidden={!choice.selected}>
        {choice.selected && <Check size={14} aria-label={uiText("client.workspaceSettings.currentlyUsing")} />}
      </span>
    </button>) : <p className={styles.hint}>{uiText("client.workspaceSettings.noMatches")}</p>}
  </section>;
}
