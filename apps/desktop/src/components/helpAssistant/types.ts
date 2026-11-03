import { imageBytes, MAX_HELP_TOTAL_IMAGE_BYTES } from './useHelpImages';

export const MAX_QUESTION_LENGTH = 4_000;
export const MAX_HISTORY_CHARACTERS = 32_000;
export const MAX_HISTORY_MESSAGES = 12;
const MAX_VISIBLE_MESSAGES = 40;
export type HelpStatus = 'ready' | 'installRequired' | 'initializeRequired' | 'accountRequired';
export interface HelpAvailability { status: HelpStatus; accountRevision?: number }
export type HelpError = Exclude<HelpStatus, 'ready'> | 'accountChanged' | 'invalidRequest'
  | 'busy' | 'unavailable' | 'answerFailed' | 'invalidImage' | 'modelNotConfigured' | 'modelUnsupported'
  | 'cancelled' | 'computerUnavailable' | 'stopFailed';
export interface HelpAnswer { text: string; sources: string[] }
export interface HelpContent { text: string; images?: string[] }
export interface HelpMessage extends HelpContent { id: number; role: 'user' | 'assistant'; sources?: string[] }

export function helpError(value: unknown): HelpError {
  const code = value instanceof Error ? value.message : value;
  const errors: HelpError[] = ['installRequired', 'initializeRequired', 'accountRequired', 'accountChanged',
    'invalidRequest', 'busy', 'unavailable', 'answerFailed', 'invalidImage', 'modelNotConfigured', 'modelUnsupported',
    'cancelled', 'computerUnavailable', 'stopFailed'];
  return errors.find((error) => error === code) ?? 'answerFailed';
}

export function messageHistory(messages: HelpMessage[], currentImages: string[] = []) {
  let characters = 0;
  let bytes = imageBytes(currentImages);
  const history: Pick<HelpMessage, 'role' | 'text' | 'images'>[] = [];
  for (const message of messages.slice(-MAX_HISTORY_MESSAGES).reverse()) {
    const length = Array.from(message.text).length;
    const images = message.role === 'user' ? message.images : undefined;
    const addedBytes = imageBytes(images ?? []);
    if (characters + length > MAX_HISTORY_CHARACTERS || bytes + addedBytes > MAX_HELP_TOTAL_IMAGE_BYTES) break;
    characters += length;
    bytes += addedBytes;
    history.unshift({ role: message.role, text: message.text, ...(images?.length ? { images } : {}) });
  }
  return history;
}

export function boundedMessages(messages: HelpMessage[]) {
  let bytes = 0;
  let start = messages.length;
  for (const message of messages.slice(-MAX_VISIBLE_MESSAGES).reverse()) {
    bytes += imageBytes(message.images ?? []);
    if (bytes > MAX_HELP_TOTAL_IMAGE_BYTES) break;
    start--;
  }
  return messages.slice(start);
}
