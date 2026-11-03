/// <reference path="./zmodem.d.ts" />
import Zmodem, { type Header } from 'zmodem.js';
import { zmodemFilename } from './zmodemFilename';

const RECEIVE_WINDOW = 32 * 1024;
const MAX_PACKET_BYTES = 128 * 1024;
const MAX_RECEIVE_BYTES = 256 * 1024 * 1024;
const MAX_BATCH_FILES = 128;
const FLOW_CONTROL_BYTES = new Set([0x11, 0x13, 0x91, 0x93]);
export const ZMODEM_ABORT = [...Array<number>(8).fill(24), ...Array<number>(8).fill(8)];

interface ReceivedFile { name: string; size?: number; offset: number; chunks: Uint8Array[] }
interface ReceiverOptions {
  send: (bytes: number[]) => void;
  progress: (file: { name: string; size?: number; offset: number }) => void;
  file: (name: string, chunks: Uint8Array[]) => void;
  end: (trailing: number[]) => void;
}

/** zmodem.js supplies codecs; this receiver adds bounded windows and ZCRCW acknowledgements.
 * Unlimited streaming can overrun the remote terminal's bounded output history before its next poll.
 */
export class ZmodemReceiver {
  private buffer: number[] = [];
  private packet?: 'file' | 'data' | 'init';
  private crc: 16 | 32 = 16;
  private current?: ReceivedFile;
  private finishing = false;
  private received = 0;
  private count = 0;
  private cancelledBytes = 0;

  constructor(private readonly options: ReceiverOptions) {}

  start() { this.options.send(Zmodem.Header.build('ZRINIT', ['CANFDX', 'CANFC32'], RECEIVE_WINDOW).to_hex()); }

  consume(bytes: number[]) {
    for (const byte of bytes) {
      this.cancelledBytes = byte === 24 ? this.cancelledBytes + 1 : 0;
      if (this.cancelledBytes >= 5) throw new Error('client.ssh.zmodemCancelled');
    }
    this.buffer.push(...bytes.filter(byte => !FLOW_CONTROL_BYTES.has(byte)));
    while (this.buffer.length) {
      if (this.finishing) { this.finish(); return; }
      if (!(this.packet ? this.consumePacket() : this.consumeHeader())) break;
    }
    if (this.buffer.length > MAX_PACKET_BYTES) throw new Error('client.ssh.zmodemFailed');
  }

  private consumeHeader() {
    Zmodem.Header.trim_leading_garbage(this.buffer);
    const parsed = Zmodem.Header.parse(this.buffer);
    if (!parsed) return false;
    const [header, crc] = parsed; this.crc = crc;
    this.header(header);
    return true;
  }

  private header(header: Header) {
    switch (header.NAME) {
      case 'ZRQINIT': this.start(); return;
      case 'ZSINIT': this.packet = 'init'; return;
      case 'ZFILE':
        if (this.current) throw new Error('client.ssh.zmodemFailed');
        this.packet = 'file'; return;
      case 'ZDATA':
        if (!this.current || header.get_offset() !== this.current.offset) throw new Error('client.ssh.zmodemFailed');
        this.packet = 'data'; return;
      case 'ZEOF': this.completeFile(header.get_offset()); return;
      case 'ZFIN':
        if (this.current) throw new Error('client.ssh.zmodemFailed');
        this.finishing = true; this.options.send(Zmodem.Header.build('ZFIN').to_hex()); return;
      default: throw new Error('client.ssh.zmodemFailed'); // Never execute ZCOMMAND or accept unsupported frames.
    }
  }

  private consumePacket() {
    const packet = this.crc === 16 ? Zmodem.Subpacket.parse16(this.buffer) : Zmodem.Subpacket.parse32(this.buffer);
    if (!packet) return false;
    const kind = this.packet;
    if (packet.frame_end()) this.packet = undefined;
    const payload = packet.get_payload();
    if (kind === 'file') this.offer(payload);
    else if (kind === 'init') this.acknowledge(0);
    else {
      this.append(payload);
      if (packet.ack_expected()) this.acknowledge(this.current!.offset);
    }
    return true;
  }

  private offer(payload: number[]) {
    const separator = payload.indexOf(0);
    if (separator < 1) throw new Error('client.ssh.zmodemFailed');
    const decoder = new Zmodem.Text.Decoder();
    const name = zmodemFilename(decoder.decode(Uint8Array.from(payload.slice(0, separator))));
    const metadata = decoder.decode(Uint8Array.from(payload.slice(separator + 1))).split(/[\s\0]/)[0];
    const size = metadata ? Number(metadata) : undefined;
    if (size !== undefined && (!Number.isSafeInteger(size) || size < 0)) throw new Error('client.ssh.zmodemFailed');
    if (++this.count > MAX_BATCH_FILES || this.received + (size ?? 0) > MAX_RECEIVE_BYTES) {
      throw new Error('client.ssh.zmodemReceiveTooLarge');
    }
    this.current = { name, size, offset: 0, chunks: [] };
    this.options.progress(this.current);
    this.options.send(Zmodem.Header.build('ZRPOS', 0).to_hex());
  }

  private append(payload: number[]) {
    const file = this.current;
    if (!file) throw new Error('client.ssh.zmodemFailed');
    this.received += payload.length;
    if (this.received > MAX_RECEIVE_BYTES) throw new Error('client.ssh.zmodemReceiveTooLarge');
    file.offset += payload.length;
    if (file.size !== undefined && file.offset > file.size) throw new Error('client.ssh.zmodemFailed');
    file.chunks.push(Uint8Array.from(payload));
    this.options.progress(file);
  }

  private completeFile(offset: number) {
    const file = this.current;
    if (!file || offset !== file.offset || (file.size !== undefined && file.size !== offset)) {
      throw new Error('client.ssh.zmodemFailed');
    }
    this.current = undefined;
    this.options.file(file.name, file.chunks);
    this.start();
  }

  private acknowledge(offset: number) {
    const bytes = [offset & 255, (offset >>> 8) & 255, (offset >>> 16) & 255, (offset >>> 24) & 255];
    this.options.send(Zmodem.Header.build('ZACK', bytes).to_hex());
  }

  private finish() {
    // Some PTYs flush the sender's final OO while restoring cooked mode. After verified ZEOF/ZFIN,
    // ordinary shell output also establishes that the transfer ended; preserve it verbatim.
    if (this.buffer[0] === 79 && this.buffer.length < 2) return;
    const trailing = this.buffer[0] === 79 && this.buffer[1] === 79 ? this.buffer.slice(2) : this.buffer;
    this.buffer = []; this.options.end(trailing);
  }
}
