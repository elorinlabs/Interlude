import { displayText } from '../i18n/index';
import { connectionEndpointRows } from '../../../../shared/remote-chat/connectionEndpoints';
import { publicEndpointRows } from '../../../../shared/remote-chat/publicEndpoints';
import { t } from '../i18n';
import type { ChatState } from './types';

export function ChatConnectionAddresses({ state }: { state: ChatState }) {
  const current = connectionEndpointRows(state.mode, state.directEndpoints);
  return <>
    {current.length > 0 && <section className="connection-health-addresses connection-health-direct"
      aria-label={t("client.chatReliability.currentP2pConnection")}>
      <h3>{t("client.chatReliability.currentP2pConnection")}</h3>
      <dl>{current.map(row => <div key={row.id}>
        <dt>{displayText(row.label)}</dt>
        <dd>{row.address ? <span>{row.address}</span>
          : <span className="connection-health-address-unknown">{t("client.chatReliability.currentlyUnavailable")}</span>}</dd>
      </div>)}</dl>
      <p>{t("client.chatReliability.showsPublicAddressesForTheCurrentConnectionWhenConfirmedOtherwise")}</p>
    </section>}
    <div className="connection-health-addresses connection-health-public">
      <dl>{publicEndpointRows(state.publicEndpoints).map(row => <div key={row.id}>
        <dt>{displayText(row.label)}</dt>
        <dd>{row.addresses.length ? row.addresses.map(address => <span key={address}>{address}</span>)
          : <span className="connection-health-address-unknown">{t("client.chatReliability.notDetectedYet")}</span>}</dd>
      </div>)}</dl>
      <p>{t("client.chatReliability.publicAddressesDetectedDuringThisConnection")}</p>
    </div>
  </>;
}
