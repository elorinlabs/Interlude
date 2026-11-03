import type { ConnectionMode } from './protocol';

const CONNECTION_LABELS: Record<ConnectionMode, string> = {
  direct: 'P2P',
  relay: 'Relay',
  connecting: "client.settings.connecting",
  offline: "client.mobile.notConnected",
};

export function downloadConnectionLabel(mode: ConnectionMode = 'offline') {
  return CONNECTION_LABELS[mode];
}
