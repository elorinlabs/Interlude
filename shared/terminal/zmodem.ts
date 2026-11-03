/// <reference path="./zmodem.d.ts" />
import Zmodem, { type Detection, type Session } from 'zmodem.js';
import { ZmodemWriter } from './zmodemWriter';
import { ZmodemReceiver, ZMODEM_ABORT } from './zmodemReceiver';
import { zmodemFilename } from './zmodemFilename';

const FILE_CHUNK_BYTES = 16 * 1024;
const MAX_SEND_BYTES = 0xffffffff;
const TRANSFER_TIMEOUT = 120_000;

export interface ZmodemFile {
  name: string; size: number; mtime?: Date;
  read: (offset: number, length: number) => Promise<Uint8Array>;
}
export interface ZmodemState {
  phase: 'offer' | 'transfer' | 'complete' | 'cancelled' | 'error';
  direction: 'send' | 'receive';
  name?: string; transferred: number; size?: number; message?: string;
}
export interface ZmodemOptions {
  write: (bytes: number[]) => Promise<void>;
  binaryMode?: (token: string, enabled: boolean) => Promise<void>;
  output: (bytes: number[]) => void;
  change: (state: ZmodemState | undefined) => void;
  file: (name: string, chunks: Uint8Array[]) => void;
}

/** Shared by desktop local, remote and Web. No bytes are sent until the user accepts. */
export class ZmodemTransfer {
  private sentry: InstanceType<typeof Zmodem.Sentry>;
  private detection?: Detection;
  private session?: Session;
  private receiver?: ZmodemReceiver;
  private state?: ZmodemState;
  private readonly writer: ZmodemWriter;
  private authorized = false;
  private disposed = false;
  private timer?: ReturnType<typeof setTimeout>;
  private lease?: string;
  private cancelWait?: () => void;
  private preparation?: Promise<void>;
  private accepting = false;

  constructor(private readonly options: ZmodemOptions) {
    this.writer = new ZmodemWriter(options.write, () => this.fail());
    this.sentry = this.createSentry();
  }

  get busy() { return this.state?.phase === 'offer' || this.state?.phase === 'transfer'; }

  output(bytes: number[]) {
    if (this.disposed) return;
    try {
      // Bound each consume call; zmodem.js uses Array.push.apply internally.
      for (let offset = 0; offset < bytes.length; offset += FILE_CHUNK_BYTES) {
        const chunk = bytes.slice(offset, offset + FILE_CHUNK_BYTES);
        if (this.receiver) this.receiver.consume(chunk); else this.sentry.consume(chunk);
      }
      if (this.session || this.receiver) this.touch();
    } catch (error) {
      this.fail(error instanceof Error && error.message.startsWith('client.ssh.') ? error.message : undefined);
    }
  }

  async accept(files: ZmodemFile[] = []) {
    if (this.disposed || this.accepting || this.state?.phase !== 'offer') return;
    this.accepting = true;
    try {
      const direction = this.state.direction;
      if (direction === 'send' && !files.length) return;
      if (direction === 'send') await this.prepareUpload();
      else if (!await this.authorize()) return;
      if (!this.busy || this.disposed) return;
      this.update({ phase: 'transfer', direction, transferred: 0 });
      if (direction === 'receive') { this.receive(); return; }
      const session = this.session;
      if (!session) { this.fail(); return; }
      const cancelled = new Promise<void>(resolve => { this.cancelWait = resolve; });
      await Promise.race([this.send(files, session), cancelled]);
      this.cancelWait = undefined;
    } catch { if (this.busy) this.fail(); }
    finally { this.accepting = false; }
  }

  /** Called only by the user's file-selection action; keep rz alive while its picker is open. */
  prepareUpload(): Promise<void> {
    if (this.preparation) return this.preparation;
    if (this.session || this.disposed || this.state?.direction !== 'send') return Promise.resolve();
    this.preparation = (async () => {
      if (!await this.authorize()) return;
      const session = this.detection!.confirm();
      this.session = session; this.detection = undefined;
      session.on('session_end', () => this.ended(session));
    })().catch(() => { if (this.busy) this.fail(); }).finally(() => { this.preparation = undefined; });
    return this.preparation;
  }

  private async authorize() {
    if (!this.detection?.is_valid() || this.state?.phase !== 'offer') return false;
    this.writer.clear(); this.authorized = true;
    // A lease identifies this viewer; authentication is enforced by the terminal owner.
    const lease = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    this.lease = lease; this.touch();
    await this.options.binaryMode?.(lease, true);
    if (this.lease === lease && !this.disposed && this.detection?.is_valid()) return true;
    await this.options.binaryMode?.(lease, false);
    if (this.lease === lease) { this.authorized = false; this.release(); clearTimeout(this.timer); }
    return false;
  }

  cancel() { this.stop('cancelled', true); }

  disconnect() {
    if (this.busy) this.stop('error', false, 'client.ssh.zmodemInterrupted');
    else { this.writer.clear(); this.sentry = this.createSentry(); }
  }

  dispose() {
    this.stop('cancelled', true);
    this.disposed = true;
  }

  private createSentry() {
    return new Zmodem.Sentry({
      to_terminal: bytes => { if (bytes.length) this.options.output(bytes); },
      // Sentry can emit an abort on retraction even before confirmation. Do not forward it.
      sender: bytes => { if (this.authorized && !this.disposed) this.writer.send(bytes); },
      on_detect: detection => {
        this.detection = detection;
        this.update({ phase: 'offer', direction: detection.get_session_role(), transferred: 0 });
      },
      on_retract: () => {
        this.detection = undefined;
        if (this.state?.phase === 'offer' && !this.session) {
          this.authorized = false; this.release(); clearTimeout(this.timer); this.update(undefined);
        }
      },
    });
  }

  private async send(files: ZmodemFile[], session: Session) {
    for (const file of files) {
      if (this.session !== session) return;
      if (!Number.isSafeInteger(file.size) || file.size < 0 || file.size > MAX_SEND_BYTES) {
        this.fail('client.ssh.zmodemSendTooLarge'); return;
      }
      this.update({ phase: 'transfer', direction: 'send', name: file.name, size: file.size, transferred: 0 });
      const transfer = await session.send_offer({ name: zmodemFilename(file.name), size: file.size, mtime: file.mtime });
      if (!transfer) continue;
      for (let offset = 0; offset < file.size; offset += FILE_CHUNK_BYTES) {
        const bytes = await file.read(offset, Math.min(FILE_CHUNK_BYTES, file.size - offset));
        if (this.session !== session) return;
        if (bytes.length !== Math.min(FILE_CHUNK_BYTES, file.size - offset)) throw new Error('Short file read');
        transfer.send(bytes);
        await this.writer.drain();
        this.touch();
        this.progress(offset + bytes.length);
      }
      await transfer.end();
    }
    if (this.session === session) await session.close();
  }

  private receive() {
    this.detection = undefined;
    this.receiver = new ZmodemReceiver({
      send: bytes => this.writer.send(bytes),
      progress: file => this.update({ phase: 'transfer', direction: 'receive',
        name: file.name, size: file.size, transferred: file.offset }),
      file: this.options.file,
      end: trailing => {
        this.receiver = undefined; this.authorized = false; clearTimeout(this.timer);
        this.sentry = this.createSentry();
        if (this.state) this.update({ ...this.state, phase: 'complete' });
        this.release();
        if (trailing.length) this.options.output(trailing);
      },
    });
    this.receiver.start(); this.touch();
  }

  private ended(session: Session) {
    if (this.session !== session) return;
    this.session = undefined;
    this.authorized = false;
    clearTimeout(this.timer);
    if (this.state && this.busy) this.update({ ...this.state,
      phase: session.aborted() ? 'error' : 'complete',
      message: session.aborted() ? 'client.ssh.zmodemFailed' : undefined });
    // Leave the writer alive until the final OO/acknowledgement is flushed.
    this.release();
  }

  private fail(message = 'client.ssh.zmodemFailed') { this.stop('error', true, message); }

  private stop(phase: 'cancelled' | 'error', notify: boolean, message?: string) {
    const active = this.busy;
    const session = this.session;
    const receiving = !!this.receiver;
    this.session = undefined;
    this.receiver = undefined;
    this.cancelWait?.(); this.cancelWait = undefined;
    clearTimeout(this.timer);
    this.writer.clear();
    if (active && this.state) this.update({ ...this.state, phase, message });
    try {
      if (notify && active) {
        this.authorized = true;
        if (receiving) this.writer.send(ZMODEM_ABORT);
        else if (session && !session.has_ended()) session.abort();
        else if (this.detection?.is_valid()) this.detection.deny();
      } else if (session && !session.has_ended()) {
        this.authorized = false; session.abort(); // Stop library keepalives without touching a disconnected shell.
      }
    } catch { /* The peer may already have aborted; state and queued writes are still cleared. */ }
    this.authorized = false; this.detection = undefined;
    this.sentry = this.createSentry();
    this.release();
  }

  private release() {
    const lease = this.lease;
    this.lease = undefined;
    if (!lease) return;
    void this.writer.drain().catch(() => undefined)
      .then(() => this.options.binaryMode?.(lease, false))
      .catch(() => undefined); // The host lease also expires if the viewer disconnects.
  }

  private touch() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.fail('client.ssh.zmodemInterrupted'), TRANSFER_TIMEOUT);
  }

  private progress(transferred: number) { if (this.state) this.update({ ...this.state, transferred }); }
  private update(state: ZmodemState | undefined) {
    this.state = state;
    if (!this.disposed) this.options.change(state);
  }
}
