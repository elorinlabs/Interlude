import type { MappingProtocol } from './settings';
import type { MappingTunnel } from './types';

/** A combined mapping is active only after both listeners have bound successfully. */
export function protocolTunnel(protocol: MappingProtocol | undefined,
  factories: { tcp: () => MappingTunnel; udp: () => MappingTunnel }): MappingTunnel {
  if (protocol !== 'both') return factories[protocol ?? 'tcp']();
  const tunnels = [factories.udp(), factories.tcp()];
  let closed = false;
  return {
    async resolve(resource, url) {
      let address = '';
      for (const tunnel of tunnels) {
        if (closed) throw new Error('Mapping closed');
        address = await tunnel.resolve(resource, url);
      }
      return address;
    },
    async close() {
      closed = true;
      await Promise.all(tunnels.map(tunnel => tunnel.close()));
    },
  };
}
