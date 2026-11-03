import { invoke } from '../api/backend';
import { MAX_AUDIO_BYTES } from '../../../../shared/chat/dictation/recording';

const SESSION_LIFETIME_MS = 10 * 60_000;
const MAX_SESSIONS = 8;
const MAX_BASE64_CHARS = Math.ceil(MAX_AUDIO_BYTES / 3) * 4;
const MIME_TYPES = new Set(['audio/webm', 'audio/mp4', 'audio/ogg', 'audio/wav']);
const EXPIRED = 'client.dictation.thisRecordingExpiredPleaseRecordAgain';
interface Session { owner: string; expires: number }

/** Bind native transcription sessions to the authenticated remote connection that created them. */
export class RemoteDictation {
  private readonly sessions = new Map<string, Session>();
  private readonly preparing = new Set<Session>();

  async request(body: Record<string, unknown>, owner: string): Promise<unknown> {
    this.prune();
    if (body.action === 'prepare') return this.prepare(owner);
    const sessionId = body.sessionId;
    if (typeof sessionId !== 'string' || this.sessions.get(sessionId)?.owner !== owner) throw new Error(EXPIRED);
    if (body.action === 'cancel') {
      this.sessions.delete(sessionId);
      return invoke<void>('codex_gui_dictation_cancel', { sessionId });
    }
    if (body.action !== 'transcribe') throw new Error(EXPIRED);
    const { data, mimeType } = body;
    if (typeof data !== 'string' || !data.length || data.length > MAX_BASE64_CHARS
      || typeof mimeType !== 'string' || mimeType.length > 128 || !MIME_TYPES.has(mimeType.split(';')[0].trim())) {
      throw new Error('client.dictation.pleaseRecordAShorterAudioClipAndTryAgain');
    }
    // Native code validates the audio, pins the account and rejects overlapping transcriptions.
    const result = await invoke<{ text: string }>('codex_gui_dictation_transcribe',
      { request: { sessionId, data, mimeType } });
    this.sessions.delete(sessionId);
    return result;
  }

  release(owner?: string) {
    for (const pending of this.preparing) {
      if (owner === undefined || pending.owner === owner) this.preparing.delete(pending);
    }
    for (const [id, session] of this.sessions) {
      if (owner === undefined || session.owner === owner) this.discard(id);
    }
  }

  private async prepare(owner: string) {
    if (this.sessions.size + this.preparing.size >= MAX_SESSIONS) {
      throw new Error('client.dictation.tooManyTranscriptionRequestsPleaseTryAgainLater');
    }
    const session = { owner, expires: Date.now() + SESSION_LIFETIME_MS };
    this.preparing.add(session);
    try {
      const result = await invoke<{ sessionId: string }>('codex_gui_dictation_prepare');
      if (!this.preparing.has(session)) {
        this.discard(result.sessionId);
        throw new Error(EXPIRED);
      }
      this.sessions.set(result.sessionId, session);
      return result;
    } finally { this.preparing.delete(session); }
  }

  private prune() {
    for (const [id, session] of this.sessions) if (session.expires <= Date.now()) this.discard(id);
  }

  private discard(sessionId: string) {
    this.sessions.delete(sessionId);
    // Disconnected cleanup is best effort; native sessions also expire independently.
    void invoke('codex_gui_dictation_cancel', { sessionId }).catch(() => undefined);
  }
}
