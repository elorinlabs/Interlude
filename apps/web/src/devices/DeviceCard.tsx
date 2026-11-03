import { getLocale, t, useLanguage } from '../i18n';
import { Dropdown } from 'antd';
import { Clock, ExternalLink, KeyRound, Laptop, Monitor, MoreVertical, Server, Sun, Trash2, UserRound } from 'lucide-react';
import { supportsScreenControl } from '../../../../shared/remote-desktop/screenControl';
import { useState } from 'react';
import { DeviceScreenSheet } from './DeviceScreenSheet';
import type { AccountSummary, RemoteDevice, RemoteProviderSummary } from '../types';
import { remoteModelOptions, type RemoteModelTarget } from '../../../../shared/remote-chat/modelTarget';

interface DeviceCardProps {
  device: RemoteDevice;
  accounts: AccountSummary[];
  providers: RemoteProviderSummary[];
  deletingDeviceId: string | null;
  switchingModelDeviceId: string | null;
  switchingAuthDeviceId: string | null;
  onSwitchModel: (deviceId: string) => void;
  onSelectAuthAccount: (deviceId: string) => void;
  onDelete: (device: RemoteDevice) => void;
  onRevokeService: (device: RemoteDevice) => void;
  onScreenControl: (device: RemoteDevice, enabled: boolean) => void;
}

function platformLabel(platform: string) {
  switch (platform.trim().toLowerCase()) {
    case 'windows': return 'Windows';
    case 'darwin':
    case 'macos': return 'macOS';
    case 'linux': return 'Linux';
    default: return platform || t("client.app.unknownPlatform");
  }
}

function modelLabel(device: RemoteDevice, accounts: AccountSummary[], providers: RemoteProviderSummary[],
  target: RemoteModelTarget) {
  const selection = remoteModelOptions(device, target);
  const account = accounts.find(item => item.id === selection.accountId);
  const provider = providers.find(item => item.id === selection.providerId);
  if (selection.group) return t("client.app.group", { value1: selection.group });
  if (!selection.providerId) return account ? t("client.app.official", { value1: account.email }) : t("client.app.notSelected");
  if (!provider) return t("client.app.modelInformationUnavailable");
  return `${provider.name}${provider.model ? ` · ${provider.model}` : ''}`;
}

function lastSeenLabel(device: RemoteDevice) {
  if (device.online) return t("client.app.onlineNow");
  const date = new Date(device.lastSeenAt);
  if (Number.isNaN(date.getTime())) return t("client.app.unknownTime");
  return new Intl.DateTimeFormat(getLocale(), {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(date);
}

function PlatformIcon({ platform }: { platform: string }) {
  useLanguage();
  if (platform.trim().toLowerCase() !== 'windows') return <Laptop size={24} aria-hidden />;
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M2 4.5 10.5 3.3V11H2zm10-1.4L22 1.7V11H12zM2 12.5h8.5v7.7L2 19zm10 0h10v9.3l-10-1.4z" />
  </svg>;
}

function DeviceDetails({ device, accounts, providers }: Pick<DeviceCardProps, 'device' | 'accounts' | 'providers'>) {
  useLanguage();
  const account = accounts.find((item) => item.id === device.activeAccountId);
  const authAccount = accounts.find((item) => item.id === device.openaiAuthAccountId);
  const details = [
    { icon: UserRound, label: t("client.app.proxyApi"), value: modelLabel(device, accounts, providers, 'proxy') },
    ...(device.capabilities.includes('gui-model-switch')
      ? [{ icon: Laptop, label: 'Codex GUI', value: modelLabel(device, accounts, providers, 'gui') }] : []),
    { icon: Server, label: t("client.app.deviceAccount"),
      value: account?.email ?? (device.activeAccountId ? t("client.app.accountInformationUnavailable") : t("client.app.notSelected")) },
    { icon: KeyRound, label: t("client.app.proxySignIn"),
      value: authAccount?.email ?? (device.openaiAuthAccountId ? t("client.app.accountInformationUnavailable") : t("client.accounts.notSet")) },
    { icon: Clock, label: t("client.app.lastOnline"), value: lastSeenLabel(device) },
  ];
  return <span className="device-details">{details.map(({ icon: Icon, label, value }) =>
    <span className="device-detail" key={label}>
      <Icon size={18} aria-hidden /><span>{label}</span><span className="device-detail-value">{value}</span>
    </span>)}</span>;
}

export function DeviceCard(props: DeviceCardProps) {
  useLanguage();
  const [confirmScreen, setConfirmScreen] = useState(false);
  const { device, deletingDeviceId, switchingModelDeviceId, switchingAuthDeviceId } = props;
  const busy = switchingModelDeviceId === device.deviceId || deletingDeviceId === device.deviceId;
  const items = [
    ...(supportsScreenControl(device) ? [
      { key: 'screen-off', icon: <Monitor size={18} />, label: t('client.deviceScreen.turnOff'),
        disabled: !device.online, onClick: () => setConfirmScreen(true) },
      { key: 'screen-restore', icon: <Sun size={18} />, label: t('client.deviceScreen.restore'),
        disabled: !device.online, onClick: () => props.onScreenControl(device, false) },
    ] : []),
    { key: 'auth', icon: <ExternalLink size={18} />, label: t("client.app.proxySignInAccount"),
      disabled: !device.online || Boolean(switchingAuthDeviceId),
      onClick: () => props.onSelectAuthAccount(device.deviceId) },
    ...(device.platform.toLowerCase() === 'windows' ? [{ key: 'revoke-service', icon: <KeyRound size={18} />,
      label: t("client.mobile.revokeUnattendedAccess"), danger: true, onClick: () => props.onRevokeService(device) }] : []),
    { key: 'delete', icon: <Trash2 size={18} />, label: device.online ? t("client.app.cannotRemoveWhileOnline") : t("client.app.removeDevice"),
      danger: true, disabled: device.online || Boolean(deletingDeviceId), onClick: () => props.onDelete(device) },
  ];
  return <><article className={`device-card ${device.online ? 'online' : 'offline'}`}>
    <button type="button" className="device-card-main" disabled={!device.online || busy} aria-busy={busy}
      aria-label={`${device.name}，${device.online ? t("client.app.selectToSwitchModel") : t("client.chat.offline")}`}
      onClick={() => props.onSwitchModel(device.deviceId)}>
      <span className="device-card-header">
        <span className="device-platform"><PlatformIcon platform={device.platform} /></span>
        <span className="device-identity"><strong>{device.name}</strong>
          <span>{platformLabel(device.platform)}{device.appVersion ? ` · v${device.appVersion}` : ''}</span></span>
        <span className="device-status"><i />{busy ? t("client.app.working") : device.online ? t("client.chat.online") : t("client.chat.offline")}</span>
      </span>
      <DeviceDetails device={device} accounts={props.accounts} providers={props.providers} />
    </button>
    <Dropdown trigger={['click']} placement="bottomRight" menu={{ items }} overlayClassName="device-options-menu">
      <button type="button" className="device-menu-trigger" aria-label={t("client.app.moreActionsFor", { value1: device.name })}>
        <MoreVertical size={20} aria-hidden />
      </button>
    </Dropdown>
  </article>
    <DeviceScreenSheet device={device} open={confirmScreen} onClose={() => setConfirmScreen(false)}
      onConfirm={() => {
        if (!confirmScreen || !device.online) return;
        setConfirmScreen(false);
        props.onScreenControl(device, true);
      }} />
  </>;
}
