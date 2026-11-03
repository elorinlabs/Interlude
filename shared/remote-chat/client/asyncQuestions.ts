import { asyncAnswerText, pendingAsyncQuestions } from '../../../apps/desktop/src/pages/codexGui/asyncQuestionState';
import type { Item, Thread } from './types';
import { queueTextPreview, type QueueMessage, type QueueSnapshot } from '../queue';
import { messageContent } from '../../chat/messageDetails';

export { asyncAnswerText };

/** Keep question-only history readable after its interactive card has been answered. */
export function questionMessageText(item: Item): string {
  const text = messageContent(item);
  if (item.delivery !== 'async') return text;
  const missing = item.questions?.filter((question) => !text.includes(question.title)
    || question.options?.some((option) => !text.includes(option))) ?? [];
  return [text, ...missing.map((question) => [question.title,
    ...question.options?.map((option) => `- ${option}`) ?? []].join('\n'))].filter(Boolean).join('\n\n');
}

export function pendingQuestions(thread: Thread | null): Item[] {
  return pendingAsyncQuestions({ turns: thread?.turns ?? [] });
}

export function questionPending(thread: Thread | null, id: string): boolean {
  return pendingQuestions(thread).some((item) => item.id === id);
}

function matchesAnswer(message: QueueMessage, text: string) {
  return typeof message.id === 'string' && Boolean(message.id.trim())
    && message.text === queueTextPreview(text) && message.imageCount === 0 && message.attachmentCount === 0;
}

/**
 * PC v1.5.1+ appends synchronously immediately before returning its enqueue snapshot.
 * Read only that operation's response, never a broadcast snapshot that another writer can replace.
 */
export function enqueuedAnswerId(response: QueueSnapshot, threadId: string, text: string): string {
  const message = response.threads?.[threadId]?.at(-1);
  if (!message || !matchesAnswer(message, text)) throw new Error('暂时无法确认回答，请查看待发送消息。');
  return message.id;
}

export function queuedAnswer(response: QueueSnapshot, options: { threadId: string; id: string; text: string }) {
  const message = response.threads?.[options.threadId]?.find((entry) => entry.id === options.id);
  if (message && !matchesAnswer(message, options.text)) throw new Error('回答内容已更改，请在待发送消息中处理。');
  return message;
}
