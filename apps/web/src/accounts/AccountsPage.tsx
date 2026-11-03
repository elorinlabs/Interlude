import { t, useLanguage } from '../i18n';
import { useCallback, useState } from 'react';
import { Empty, PullToRefresh, SpinLoading, Toast } from 'antd-mobile';
import { ChevronRight, Laptop } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '../hooks';
import { refreshAll, switchDeviceAccount } from '../store';
import { AdaptiveSheet } from '../components/AdaptiveSheet';
import { AddAccountSheet } from '../components/AddAccountSheet';
import { useRemoteModelRestartPrompt } from '../devices/useRemoteModelRestartPrompt';
import { AccountCard } from './AccountCard';
import { AccountOverview } from './AccountOverview';
import { AccountDetails } from './AccountDetails';
import { QuotaConsumptionSheet } from './QuotaConsumptionSheet';
import { selectUsageDevice, usageDevice } from './remoteUsage';
import { maskEmail } from './formatters';
import './styles.css';

const REFRESH_TEXT = { get pulling() { return t("client.accounts.pullToRefresh"); }, get canRelease() { return t("client.accounts.releaseToRefresh"); }, get refreshing() { return t("client.accounts.refreshing"); }, get complete() { return t("client.accounts.refreshed"); } };

export function AccountsPage() {
  useLanguage();
  const dispatch = useAppDispatch();
  const { accounts, devices, loading, refreshing, switchingAccountId, lastRefreshAt } = useAppSelector(s => s.data);
  const { consumingQuota, refreshingAccountId, selectedChatDeviceId } = useAppSelector(s => s.data);
  const usageBusy = refreshing || consumingQuota || Boolean(refreshingAccountId);
  const promptRestart = useRemoteModelRestartPrompt();
  const [privateMode, setPrivateMode] = useState(true);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [switchId, setSwitchId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [consumeDeviceName, setConsumeDeviceName] = useState<string | null>(null);
  const detail = accounts.find(account => account.id === detailId);
  const target = accounts.find(account => account.id === switchId);
  const online = devices.filter(device => device.online);
  const refresh = useCallback(async () => {
    try { await dispatch(refreshAll()).unwrap(); }
    catch { /* The global toast reports the failure. */ }
  }, [dispatch]);
  const openConsumption = () => {
    try { setConsumeDeviceName(usageDevice(devices, selectedChatDeviceId).name); }
    catch (error) { Toast.show({ icon: 'fail', content: error instanceof Error ? error.message : t("client.mobile.tryAgainLater") }); }
  };

  const switchAccount = async (deviceId: string) => {
    if (!target || switchingAccountId) return;
    try {
      const { result } = await dispatch(switchDeviceAccount({ deviceId, accountId: target.id })).unwrap();
      Toast.show({ icon: 'success', content: t("client.accounts.switchedToAnOfficialModel") });
      setSwitchId(null);
      if (result.requiresRestart) window.setTimeout(() => void promptRestart(deviceId), 0);
    } catch { /* The global toast reports the failure. */ }
  };

  return <>
    <PullToRefresh onRefresh={refresh} renderText={status => REFRESH_TEXT[status]}>
      <div className="page-body accounts-page">
        <AccountOverview count={accounts.length} online={online.length} privateMode={privateMode}
          refreshing={refreshing} consuming={consumingQuota} busy={usageBusy} onConsume={openConsumption}
          updatedAt={lastRefreshAt} onPrivacy={() => setPrivateMode(value => !value)}
          onRefresh={() => void refresh()} onAdd={() => setAdding(true)} />
        {loading ? <div className="page-loading"><SpinLoading /><span>{t("client.accounts.loadingAccounts")}</span></div>
          : !accounts.length ? <Empty description={t("client.accounts.noAccountsYetSelectAddAccountToGetStarted")} />
            : <div className="accounts-grid">{accounts.map(account => <AccountCard key={account.id}
              account={account} privateMode={privateMode} busy={Boolean(switchingAccountId)}
              switching={switchingAccountId === account.id} onOpen={() => setDetailId(account.id)}
              onSwitch={() => setSwitchId(account.id)} />)}</div>}
      </div>
    </PullToRefresh>
    {detail && <AccountDetails key={detail.id} account={detail} devices={devices} privateMode={privateMode}
      onClose={() => setDetailId(null)} onUpdated={refresh}
      onSwitch={() => { setDetailId(null); setSwitchId(detail.id); }} />}
    {consumeDeviceName && <QuotaConsumptionSheet accounts={accounts} privateMode={privateMode}
      deviceName={selectUsageDevice(devices, selectedChatDeviceId)?.name ?? consumeDeviceName}
      onClose={() => setConsumeDeviceName(null)} />}
    <AddAccountSheet open={adding} onClose={() => setAdding(false)} onAdded={refresh} />
    <AdaptiveSheet open={Boolean(target)} title={t("client.accounts.switchOnADevice")}
      subtitle={target ? (privateMode ? maskEmail(target.email) : target.email) : undefined}
      onClose={() => setSwitchId(null)}>
      {!online.length ? <Empty description={t("client.accounts.noDevicesOnlineOpenInterludeOnYourComputerFirst")} />
        : <div className="select-list">{online.map(device => {
          const current = device.activeAccountId === target?.id && !device.activeProviderId;
          return <button key={device.deviceId} type="button" disabled={current || Boolean(switchingAccountId)}
            onClick={() => void switchAccount(device.deviceId)}>
            <span className="device-mini-icon"><Laptop size={19} /></span>
            <span><strong>{device.name}</strong><small>{device.platform}  {t("client.accounts.online")}</small></span>
            {current ? <b className="current-pill">{t("client.accounts.current")}</b> : <ChevronRight size={18} />}
          </button>;
        })}</div>}
    </AdaptiveSheet>
  </>;
}
