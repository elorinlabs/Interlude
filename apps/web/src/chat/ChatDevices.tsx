import { t, useLanguage } from '../i18n';
import { AdaptiveSheet } from '../components/AdaptiveSheet';
import type { ChatComputer } from '../../../../shared/remote-chat/devices';
import { useState } from 'react';
import { ComputerSearchBar, type ComputerListRefresh } from '../../../../shared/remote-chat/ComputerSearchBar';
import { useDesktopLayout } from '../useDesktopLayout';

export function ChatDevices({ devices, choose, chooseLocal, onClose, refresh }: {
  devices: ChatComputer[]; choose: (id: string) => void; onClose: () => void; chooseLocal?: () => void;
  refresh?: ComputerListRefresh;
}) {
  useLanguage();
  const desktop = useDesktopLayout();
  const [query, setQuery] = useState('');
  const keyword = desktop ? query.trim().toLocaleLowerCase() : '';
  const matches = devices.filter(device => device.name.toLocaleLowerCase().includes(keyword));
  const showLocal = chooseLocal && t("client.composer.thisComputer").toLocaleLowerCase().includes(keyword);
  return <AdaptiveSheet open title={t("client.settings.chooseAComputer")} width={400} onClose={onClose}>
    <div className="chat-settings">
      {showLocal && <button type="button" className="chat-setting-entry" onClick={chooseLocal}>
        <strong>{t("client.composer.thisComputer")}</strong></button>}
      {matches.map((device) => <button type="button" key={device.deviceId} className="chat-setting-entry"
        disabled={!device.online} onClick={() => choose(device.deviceId)}>
        <strong>{device.name}</strong><span>{device.online ? t("client.chat.online") : t("client.chat.offline")}</span>
      </button>)}
      {!devices.length && <p className="chat-muted">{t("client.chat.openInterludeOnYourComputerAndSignInWith")}</p>}
      {!!keyword && !showLocal && !matches.length
        && <p className="chat-muted">{t("client.workspaceSettings.noMatchingComputers")}</p>}
      {desktop && refresh?.error && <p className="chat-error" role="alert">{refresh.error}</p>}
      {desktop && <ComputerSearchBar query={query} onQueryChange={setQuery}
        searchLabel={t("client.workspaceSettings.searchComputers")} refreshLabel={t("client.workspaceSettings.refreshComputerList")} refresh={refresh} />}
    </div>
  </AdaptiveSheet>;
}
