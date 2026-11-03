import type { ForwardingClient } from './service';
import type { StreamBudget } from './streamBudget';
import type { MappingProtocol } from './settings';

export interface MappingTunnel {
  resolve: (resource: string, url: string) => Promise<string>;
  close: () => Promise<void>;
}
export interface MappingTunnelOptions {
  localPort: number;
  protocol?: MappingProtocol;
  onClosed: () => void;
  bridgeBudget: StreamBudget;
}
export type TunnelFactory = (client: ForwardingClient,
  options: MappingTunnelOptions & { mappingId: string }) => MappingTunnel;
