import type { ChatController } from './controller';
import type { ChatState } from './types';
import type { QueueAction, QueueMessage, QueueDraft } from '../queue';
import { currentRunningTurn } from '../../chat/runningTurn';

export interface QueueProps {
  messages: QueueMessage[];
  running: boolean;
  disabled: boolean;
  act: (operation: QueueAction, id?: string) => Promise<void>;
  take: (id: string) => Promise<QueueDraft | undefined>;
}

export function queueProps(state: ChatState, controller: ChatController): QueueProps {
  return {
    messages: state.queue.threads[state.selected?.id ?? ''] ?? [],
    running: Boolean(currentRunningTurn(state.selected?.turns)),
    disabled: !state.ready || state.queueBusy,
    act: (operation, id) => controller.queueAction(operation, id),
    take: (id) => controller.takeQueuedMessage(id),
  };
}
