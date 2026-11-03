import { t, useLanguage } from '../i18n';
import { useState } from 'react';
import type { ChatComputer } from '../../../../shared/remote-chat/devices';
import type { ChatState } from './types';
import type { ChatController } from '../../../../shared/remote-chat/client/controller';
import { ChatReconnectButton } from './ChatReconnectButton';
import { HOST_IDENTITY_CHANGED } from '../../../../shared/remote-chat/trustedHost';
import { HostIdentityVerification } from './HostIdentityVerification';
import { ChatConnectionHealth } from './ChatConnectionHealth';
import { ChatConnectionAction } from './ChatConnectionAction';

const modeLabels = { get connecting() { return t("client.settings.connecting"); }, direct: 'P2P', relay: 'Relay', get offline() { return t("client.chat.waitingToReconnect"); } };

export function ChatConnectionInfo({ state, controller, device, active, chooseDevice }: {
  state: ChatState; controller: ChatController; device?: ChatComputer; active: boolean; chooseDevice: () => void;
}) {
  useLanguage();
  const [verifying, setVerifying] = useState(false);
  const [healthOpen, setHealthOpen] = useState(false);
  const canReconnect = active && device && !state.ready && !state.connecting && state.mode !== 'connecting';
  let status = modeLabels[state.mode];
  if (!state.ready && (state.mode === 'direct' || state.mode === 'relay')) status = t("client.chat.syncingChats");
  if (!state.ready && state.error) status = t("client.chat.connectionIncomplete");
  return <>
    <div className="chat-connection-info chat-muted">
      <div className="chat-connection-summary">
        <ChatConnectionAction className="chat-connection-name" label={t("client.settings.chooseAComputer")} onClick={chooseDevice}>
          {device ? device.name : t("client.chat.chooseAComputerToStartChatting")}
        </ChatConnectionAction>
        {device && <ChatConnectionAction className="chat-connection-status"
          label={`${status} · ${t("client.chatReliability.connectionCheck")}`} expanded={healthOpen} onClick={() => setHealthOpen(true)}>
          {' · '}<span role="status">{status}</span>
        </ChatConnectionAction>}
      </div>
      <div className="chat-connection-actions">
        {state.error === HOST_IDENTITY_CHANGED && <ChatConnectionAction className="chat-connection-verify"
          label={t("client.remoteDesktop.verifyComputerIdentity")} onClick={() => setVerifying(true)}>
          {t("client.remoteDesktop.verifyComputerIdentity")}</ChatConnectionAction>}
        {canReconnect && <ChatReconnectButton retryAt={state.retryAt} onClick={controller.connectNow} />}
      </div>
    </div>
    {active && healthOpen && <ChatConnectionHealth state={state} device={device}
      reconnect={controller.connectNow} close={() => setHealthOpen(false)} />}
    {active && verifying && <HostIdentityVerification
      confirm={controller.confirmHostIdentity} close={() => setVerifying(false)} />}
  </>;
}
