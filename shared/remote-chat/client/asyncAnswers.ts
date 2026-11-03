import type { QueueSnapshot } from '../queue';
import type { ChatState, Item } from './types';
import { asyncAnswerText, enqueuedAnswerId, questionPending, queuedAnswer } from './asyncQuestions';

interface Host {
  snapshot: () => ChatState;
  request: <T>(body: Record<string, unknown>) => Promise<T>;
  update: (patch: Partial<ChatState>) => void;
  applyQueue: (queue: QueueSnapshot) => void;
  refresh: () => Promise<void>;
}
interface Answer { threadId: string; itemId: string; text: string; id?: string }
const MAX_ANSWER_LENGTH = 100_000;
const UNCONFIRMED = '暂时无法确认回答是否已发送，请查看待发送消息。';

/** Answers reuse the PC's queue so acknowledged user messages update both screens. */
export class AsyncAnswers {
  private readonly answers = new Map<string, Answer>();
  constructor(private readonly host: Host) {}

  async submit(item: Item, values: string[]): Promise<boolean> {
    const state = this.host.snapshot();
    const thread = state.selected;
    const text = asyncAnswerText(item, values);
    if (!thread || !text || !state.ready || state.selectedArchived || state.sending || state.settingsBusy
      || state.queueBusy || state.compacting === thread.id || !questionPending(thread, item.id)) return false;
    if (text.length > MAX_ANSWER_LENGTH) { this.host.update({ error: '回答较长，请缩短后再发送。' }); return false; }
    const key = JSON.stringify([thread.id, item.id]);
    const previous = this.answers.get(key);
    if (previous && previous.text !== text) {
      this.host.update({ error: '上次回答仍待确认，请先在待发送消息中处理。' }); return false;
    }
    const answer = previous ?? { threadId: thread.id, itemId: item.id, text };
    this.host.update({ sending: true, error: '' });
    try {
      const queue = previous ? await this.retryQueue(answer) : await this.enqueue(key, answer);
      await this.sendQueued(answer, queue);
      return !questionPending(this.host.snapshot().selected, item.id);
    } catch (error) {
      this.host.update({ error: error instanceof Error ? error.message : '回答发送失败，请重试。' });
      return false;
    } finally { this.host.update({ sending: false }); }
  }

  private async enqueue(key: string, answer: Answer) {
    const { settings } = this.host.snapshot();
    // An enqueue timeout may already have committed. Keep the record so a retry cannot enqueue twice.
    this.answers.set(key, answer);
    let queue: QueueSnapshot;
    try {
      queue = await this.host.request<QueueSnapshot>({ operation: 'queueEnqueue', threadId: answer.threadId,
        text: answer.text, images: [], skills: [], access: settings.access,
        model: settings.model, effort: settings.effort });
    } catch { throw new Error(UNCONFIRMED); }
    answer.id = enqueuedAnswerId(queue, answer.threadId, answer.text);
    this.host.applyQueue(queue);
    return queue;
  }

  private async retryQueue(answer: Answer) {
    if (!answer.id) throw new Error(UNCONFIRMED);
    const queue = await this.host.request<QueueSnapshot>({ operation: 'queueRead' });
    this.host.applyQueue(queue);
    return queue;
  }

  private ensureSelected(answer: Answer) {
    const state = this.host.snapshot();
    if (!state.ready || state.selected?.id !== answer.threadId) {
      throw new Error('聊天已切换或连接中断，请回到原聊天后重试。');
    }
  }

  private async sendQueued(answer: Answer, initialQueue: QueueSnapshot) {
    this.ensureSelected(answer);
    if (!answer.id) throw new Error(UNCONFIRMED);
    const options = { threadId: answer.threadId, id: answer.id, text: answer.text };
    let queue = initialQueue;
    const pending = queuedAnswer(queue, options);
    // A removed/already-sent ID must never fall through to flushing another writer's messages.
    if (pending && !pending.busy) {
      queue = await this.host.request<QueueSnapshot>({ operation: 'queueSendNow',
        threadId: answer.threadId, id: answer.id });
      this.host.applyQueue(queue);
    }
    this.ensureSelected(answer);
    await this.host.refresh();
    this.ensureSelected(answer);
    if (!questionPending(this.host.snapshot().selected, answer.itemId)) return;
    const remaining = queuedAnswer(queue, options);
    if (remaining?.error) throw new Error('回答发送失败，请重试。');
    if (remaining) throw new Error('回答已在待发送消息中，可在那里查看发送进度。');
    throw new Error(UNCONFIRMED);
  }
}
