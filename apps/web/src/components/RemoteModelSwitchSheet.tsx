import { t, useLanguage } from '../i18n';
import { useState } from 'react';
import { isRemoteAggregateId, remoteModelOptions, type RemoteModelTarget } from '../../../../shared/remote-chat/modelTarget';
import { ChevronRight } from "lucide-react";
import type { AccountSummary, RemoteDevice, RemoteProviderSummary } from "../types";
import { AdaptiveSheet } from "./AdaptiveSheet";

interface RemoteModelSwitchSheetProps {
  device: RemoteDevice | null;
  accounts: AccountSummary[];
  providers: RemoteProviderSummary[];
  switchingAccountId: string | null;
  switchingProviderId: string | null;
  onClose: () => void;
  onSwitchAccount: (deviceId: string, accountId: string, target: RemoteModelTarget) => Promise<boolean>;
  onSwitchProvider: (deviceId: string, providerId: string, target: RemoteModelTarget) => Promise<boolean>;
  onSwitchProviderGroup: (deviceId: string, group: string) => Promise<boolean>;
}

export function RemoteModelSwitchSheet({
  device,
  accounts,
  providers,
  switchingAccountId,
  switchingProviderId,
  onClose,
  onSwitchAccount,
  onSwitchProvider,
  onSwitchProviderGroup,
}: RemoteModelSwitchSheetProps) {
  useLanguage();
  const [target, setTarget] = useState<RemoteModelTarget>('proxy');
  const busy = Boolean(switchingAccountId || switchingProviderId);
  const options = remoteModelOptions(device, target);
  const { supported: providerSupported, providerAvailable, groupSupported } = options;
  const groups = target === 'gui' ? [] : [...new Set(providers.map((provider) => provider.group).filter(Boolean))];

  const selectAccount = async (accountId: string) => {
    if (!device?.online || busy || !options.accountAvailable) return;
    if (await onSwitchAccount(device.deviceId, accountId, target)) onClose();
  };
  const selectProvider = async (providerId: string) => {
    if (!device?.online || busy || !providerAvailable) return;
    if (isRemoteAggregateId(providerId) && !options.aggregateAvailable) return;
    if (await onSwitchProvider(device.deviceId, providerId, target)) onClose();
  };
  const selectProviderGroup = async (group: string) => {
    if (!device?.online || busy || !providerAvailable || !groupSupported) return;
    if (await onSwitchProviderGroup(device.deviceId, group)) onClose();
  };

  return <AdaptiveSheet open={Boolean(device)} title={t("client.app.switchModel")}
    subtitle={device ? t("client.app.chooseTheModelSourceForThisComputer", { value1: device.name }) : undefined}
    width={440} onClose={() => { if (!busy) onClose(); }}>
    <div className="model-switch-target" role="group" aria-label={t("client.app.switchTarget")}>
      <button type="button" aria-pressed={target === 'proxy'} disabled={busy}
        onClick={() => setTarget('proxy')}>{t("client.app.proxyApiModel")}</button>
      <button type="button" aria-pressed={target === 'gui'} disabled={busy}
        onClick={() => setTarget('gui')}>{t("client.app.codexGuiModel")}</button>
    </div>
    <p className="model-switch-description">{target === 'gui'
      ? t("client.app.changeTheModelSourceUsedByCodexGuiOnly") : t("client.app.changeTheModelSourceUsedByTheProxyApiOnly")}</p>
    {target === 'gui' && !providerSupported
      ? <p className="model-switch-empty" role="status">{t("client.app.updateTheDesktopAppToSwitchTheCodexGuiModel")}</p> : null}
    <div className="model-switch-section">
      <h3>{t("client.app.officialModel")}</h3>
      {!accounts.length ? <p className="model-switch-empty">{t("client.app.noOfficialAccountsSyncedYet")}</p>
        : <div className="select-list account-select-list">{accounts.map((account) => {
          const current = !options.providerId && !options.group && options.accountId === account.id;
          return <button type="button" disabled={busy || !device?.online || !options.accountAvailable || current}
            key={`account:${account.id}`} onClick={() => void selectAccount(account.id)}>
            <span className="account-initial">O</span><span><strong>{account.email}</strong>
              <small>{t("client.app.officialModel.68ebd2")} {account.plan || "ChatGPT"}</small></span>
            {switchingAccountId === account.id
              ? <span className="model-switch-loading">{t("client.app.switching")}</span>
              : current ? <b className="current-pill">{t("client.accounts.current")}</b> : <ChevronRight size={18} />}
          </button>;
        })}</div>}
    </div>

    <div className="model-switch-section">
      <div className="model-switch-heading"><h3>{t("client.app.thirdPartyProvider")}</h3>
        {!providerSupported ? <span>{t("client.app.updateTheDesktopAppFirst")}</span>
          : !providerAvailable ? <span>{t("client.app.startTheLocalProxyOnYourComputerFirst")}</span> : null}</div>
      {!providers.length ? <p className="model-switch-empty">{t("client.app.noThirdPartyProvidersSyncedYet")}</p>
        : <div className="select-list account-select-list">
          {groups.map((group) => {
            const count = providers.filter((provider) => provider.group === group).length;
            const current = device?.activeProviderGroup === group;
            return <button type="button" disabled={busy || !device?.online || !providerAvailable
              || !groupSupported || current} key={`group:${group}`}
              onClick={() => void selectProviderGroup(group)}>
              <span className="account-initial provider-initial">G</span><span>
                <strong>{group}</strong><small>{t("client.app.enableTogether")} {count}  {t("client.app.apis")}</small></span>
              {switchingProviderId === `group:${group}`
                ? <span className="model-switch-loading">{t("client.app.switching")}</span>
                : current ? <b className="current-pill">{t("client.app.currentGroup")}</b> : <ChevronRight size={18} />}
            </button>;
          })}
          {providers.map((provider) => {
            const current = options.providerId === provider.id;
            const aggregate = isRemoteAggregateId(provider.id);
            const unsupported = aggregate && !options.aggregateAvailable;
            return <button type="button"
              disabled={busy || !device?.online || !providerAvailable || unsupported || current}
              key={`provider:${provider.id}`} onClick={() => void selectProvider(provider.id)}>
              <span className="account-initial provider-initial">{aggregate ? "A" : "P"}</span><span>
                <strong>{provider.name}</strong><small>{unsupported ? t("client.app.updateTheDesktopAppFirst")
                  : provider.model || t("client.app.letCodexChooseTheModel")}</small></span>
              {switchingProviderId === provider.id
                ? <span className="model-switch-loading">{t("client.app.switching")}</span>
                : current ? <b className="current-pill">{t("client.accounts.current")}</b> : <ChevronRight size={18} />}
            </button>;
          })}</div>}
    </div>
    <p className="model-switch-footer">
      {target === 'gui' ? t("client.app.futureCodexGuiRequestsWillUseTheSelectedSourceNo")
        : t("client.app.restartChatgptCodexAfterSwitchingBetweenOfficialModelsAndThird")}</p>
  </AdaptiveSheet>;
}
