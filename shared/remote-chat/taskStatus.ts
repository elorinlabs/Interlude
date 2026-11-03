import type { ChatState, Turn } from './client/types';
import { liveChat } from './connectionHealth';
import type { TaskDelivery } from './taskDelivery';
import type { QueueMessage } from './queue';

export interface TaskStatus { label: string; detail: string; kind: 'progress' | 'confirmation' | 'issue' }

const SUBMISSION: Partial<Record<TaskDelivery['phase'], TaskStatus>> = {
  unknown: { label: "client.chatReliability.deliveryNeedsVerification",
    detail: "client.chatReliability.yourComputerHasNotConfirmedThisMessageCheckChatAnd", kind: 'issue' },
  sending: { label: "client.chatReliability.sending", detail: "client.chatReliability.sendingTheMessageToYourComputer", kind: 'progress' },
  sent: { label: "client.chatReliability.sent", detail: "client.chatReliability.waitingForYourComputerToConfirmReceiptAiMayNot", kind: 'progress' },
};
const EXECUTION: Record<string, TaskStatus | undefined> = {
  inProgress: { label: "client.chatReliability.aiHasStarted", detail: "client.chatReliability.checkChatForTheLatestProgress", kind: 'progress' },
  completed: { label: "client.chatReliability.resultReadyForReview", detail: "client.chatReliability.theTaskHasFinishedReviewTheResponseAndChanges", kind: 'confirmation' },
  failed: { label: "client.chatReliability.taskUnfinished", detail: "client.chatReliability.reviewTheFailureBeforeDecidingHowToContinue", kind: 'issue' },
  interrupted: { label: "client.chatReliability.taskStopped", detail: "client.chatReliability.reviewTheExistingResultBeforeContinuing", kind: 'progress' },
};

function queuedStatus(queue: QueueMessage[]): TaskStatus | undefined {
  if (!queue.length) return;
  const attention = queue.some(item => item.error);
  return { label: attention ? "client.chatReliability.queuedMessagesNeedAttention" : "client.chatReliability.receivedByComputer",
    detail: attention ? "client.chatReliability.queuedMessagesNeedAttentionSeeTheDetailsBelow"
    : "client.chatReliability.theMessageIsSavedInYourComputerSQueueWaiting", kind: attention ? 'issue' : 'progress' };
}

function executionStatus(turn?: Turn, delivery?: TaskDelivery): TaskStatus | undefined {
  const users = turn?.items.filter(item => item.type === 'userMessage').length ?? 0;
  if (delivery?.phase === 'received' && turn?.id === delivery.afterTurnId && users <= (delivery.afterUserCount ?? 0)) {
    return { label: "client.chatReliability.receivedByComputer", detail: "client.chatReliability.waitingForProgressOnThisMessageCheckChatAndThe", kind: 'progress' };
  }
  if (turn && EXECUTION[turn.status]) return EXECUTION[turn.status];
  if (delivery?.phase === 'received') return { label: "client.chatReliability.receivedByComputer",
    detail: "client.chatReliability.yourComputerConfirmedReceiptWaitingForProgressToSync", kind: 'progress' };
}

/** Submission receipts describe messages; execution state comes only from the engine/history. */
export function taskStatus(state: ChatState): TaskStatus | undefined {
  const thread = state.selected;
  if (!thread) return state.sending
    ? { label: "client.chatReliability.preparingTask", detail: "client.chatReliability.theTaskWillBeSentWhenReady", kind: 'progress' } : undefined;
  const delivery = state.deliveries?.[thread.id];
  const submission = delivery && SUBMISSION[delivery.phase];
  if (submission) return submission;
  const turn = thread.turns?.at(-1);
  const queue = state.queue.threads[thread.id] ?? [];
  if (!liveChat(state) && (turn?.status === 'inProgress' || queue.length || delivery?.phase === 'received')) {
    return { label: "client.chatReliability.taskStatusNeedsUpdating", detail: "client.chatReliability.disconnectedShowingTheLastKnownStateProgressWillUpdateAfter", kind: 'issue' };
  }
  if (state.approvals.some(event => event.params.threadId === thread.id)) {
    return { label: "client.chatReliability.awaitingYourApproval", detail: "client.chatReliability.reviewThePendingRequestsBelowSoTheTaskCanContinue", kind: 'confirmation' };
  }
  return queuedStatus(queue) ?? executionStatus(turn, delivery);
}

/** Keep routine progress and approvals in the conversation; the header only shows issues. */
export function taskIssue(state: ChatState): TaskStatus | undefined {
  const status = taskStatus(state);
  return status?.kind === 'issue' ? status : undefined;
}
