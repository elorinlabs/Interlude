import type { UdpPacket } from '../terminal/links';
import type { ForwardingClient } from './service';
import type { MappingTunnel, MappingTunnelOptions } from './types';
import { UDP_PROTOCOL_VERSION } from './datagrams';
export interface DatagramEndpoint {
  read: () => Promise<UdpPacket[]>;
  write: (packets: UdpPacket[]) => Promise<void>;
  close: () => Promise<void>;
}
export type UdpListenerFactory = (port: number) => Promise<DatagramEndpoint>;

/** Each record preserves one datagram and its originating client across the authenticated channel. */
export class UdpMappingTunnel implements MappingTunnel {
  private closed = false;
  private local?: DatagramEndpoint;
  private remote?: DatagramEndpoint;
  private starting?: Promise<string>;
  private stopping?: Promise<void>;

  constructor(private readonly client: ForwardingClient, private readonly options: MappingTunnelOptions,
    private readonly listen: UdpListenerFactory) {}

  resolve = (resource: string, url: string) => {
    this.starting ??= this.start(resource, url);
    return this.starting;
  };

  close = () => {
    this.closed = true;
    this.stopping ??= this.shutdown();
    return this.stopping;
  };

  private async start(resource: string, url: string) {
    this.remote = await this.connect(resource, url);
    if (this.closed) throw new Error('Mapping closed');
    this.local = await this.listen(this.options.localPort);
    if (this.closed) throw new Error('Mapping closed');
    void this.pump(this.local, this.remote);
    void this.pump(this.remote, this.local);
    return `udp://127.0.0.1:${this.options.localPort}`;
  }

  private async connect(resource: string, url: string): Promise<DatagramEndpoint> {
    let id: string;
    try {
      const reply = await this.client.link(resource, { type: 'udpConnect', url, version: UDP_PROTOCOL_VERSION });
      if (reply.type !== 'socket') throw new Error('Unexpected UDP response');
      id = reply.id;
    } catch { throw new Error('UDP 映射未能启动，请确认两端应用均已更新。'); }
    return {
      read: async () => {
        const reply = await this.client.link(resource, { type: 'udpRead', id });
        if (reply.type !== 'datagrams') throw new Error('Unexpected UDP response');
        return reply.packets;
      },
      write: async packets => { await this.client.link(resource, { type: 'udpWrite', id, packets }); },
      close: async () => { await this.client.link(resource, { type: 'udpClose', id }); },
    };
  }

  private async pump(source: DatagramEndpoint, destination: DatagramEndpoint) {
    try {
      while (!this.closed) {
        const packets = await source.read();
        if (!this.closed && packets.length) await destination.write(packets);
      }
    } catch { if (!this.closed) this.options.onClosed(); }
  }

  private async shutdown() {
    await this.starting?.catch(() => undefined);
    await Promise.all([this.local, this.remote].map(endpoint => endpoint?.close()
      .catch(() => console.warn('UDP mapping cleanup failed'))));
  }
}
