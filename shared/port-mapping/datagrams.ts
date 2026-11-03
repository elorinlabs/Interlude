import type { UdpPacket } from '../terminal/links';

export const UDP_PROTOCOL_VERSION = 2;
export const UDP_MAX_DATAGRAM = 65_507;
export const UDP_MAX_BATCH = 64;
export const UDP_MAX_BATCH_BYTES = 256 * 1024;
export const UDP_QUEUE_SIZE = 512;
export const UDP_QUEUE_BYTES = 2 * 1024 * 1024;
export const UDP_MAX_PEERS = 64;
export const UDP_PEER_IDLE_MS = 60_000;

/** Count empty datagrams too; payload budgets alone would allow an unbounded empty-packet burst. */
export class DatagramQueue {
  private readonly packets: { packet: UdpPacket; bytes: number }[] = [];
  private bytes = 0;
  get length() { return this.packets.length; }

  push(packet: UdpPacket, bytes: number) {
    if (this.length >= UDP_QUEUE_SIZE || this.bytes + bytes > UDP_QUEUE_BYTES) return false;
    this.packets.push({ packet, bytes }); this.bytes += bytes;
    return true;
  }

  take() {
    let count = 0;
    let bytes = 0;
    for (const packet of this.packets) {
      if (count === UDP_MAX_BATCH || bytes + packet.bytes > UDP_MAX_BATCH_BYTES) break;
      count++; bytes += packet.bytes;
    }
    this.bytes -= bytes;
    return this.packets.splice(0, count).map(value => value.packet);
  }

  clear() { this.packets.length = 0; this.bytes = 0; }
}
