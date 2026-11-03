import { displayText } from '../../../../../shared/localization/messages';
import { uiText } from "../../i18n/uiText";
import type { Item } from "./types";

const ACTIVITY_LABELS: Record<string, string> = {
  get started() { return uiText("client.shared.collaborationStarted"); }, get interacted() { return uiText("client.shared.collaborationMessage"); }, get interrupted() { return uiText("client.shared.collaborationStopped"); }, get completed() { return uiText("client.shared.collaborationCompleted"); },
};
const TOOL_LABELS: Record<string, string> = {
  get spawnAgent() { return uiText("client.shared.startCollaboration"); }, get sendInput() { return uiText("client.shared.sendTaskInstructions"); }, get resumeAgent() { return uiText("client.shared.resumeCollaboration"); },
  get wait() { return uiText("client.shared.waitForCollaboration"); }, get closeAgent() { return uiText("client.shared.closeCollaboration"); }, get sendMessage() { return uiText("client.shared.sendCollaborationMessage"); },
  get followupTask() { return uiText("client.shared.addFollowUpTask"); }, get interruptAgent() { return uiText("client.shared.stopCollaboration"); }, get listAgents() { return uiText("client.shared.viewCollaboration"); },
};
const STATUS_LABELS: Record<string, string> = {
  get pendingInit() { return uiText("client.shared.preparing"); }, get running() { return uiText("client.chat.inProgress"); }, get inProgress() { return uiText("client.chat.inProgress"); }, get completed() { return uiText("client.chat.completed"); },
  get interrupted() { return uiText("client.chat.stopped"); }, get errored() { return uiText("client.taskReview.failed"); }, get failed() { return uiText("client.taskReview.failed"); }, get shutdown() { return uiText("client.shared.closed"); }, get notFound() { return uiText("client.shared.taskNotFound"); },
};

export function isCollaborationActivity(item: Item): boolean {
  return ["subAgentActivity", "collabAgentToolCall", "collabToolCall"].includes(item.type);
}

export function collaborationTaskName(item: Item): string {
  return item.agentPath?.split("/").filter(Boolean).at(-1) || uiText("client.chat.collaboration");
}

export function collaborationStatus(status?: string): string {
  return STATUS_LABELS[status ?? ""] ?? uiText("client.shared.awaitingStatus");
}

export function collaborationSummary(item: Item, translate = displayText): string {
  if (item.type === "subAgentActivity") {
    const label = translate(ACTIVITY_LABELS[item.kind ?? ""] ?? uiText("client.shared.collaborationUpdate"));
    return uiText("client.interface.message.7c639b", { value1: label, value2: item.agentPath ? collaborationTaskName(item) : translate("client.chat.collaboration") });
  }
  const label = TOOL_LABELS[item.tool ?? ""] ?? uiText("client.chat.collaboration");
  const count = new Set([...item.receiverThreadIds ?? [], ...Object.keys(item.agentsStates ?? {})]).size;
  const status = item.tool === "wait" && item.status === "completed"
    ? uiText("client.shared.waitEnded") : item.status && collaborationStatus(item.status);
  return [translate(label), count ? uiText("client.interface.message.4040b7", { value1: count, value2: translate("client.shared.tasks") }) : undefined, status && translate(status)]
    .filter(Boolean).join(" · ");
}

/** Older collaboration items carry one agentStatus instead of an agentsStates map. */
export function collaborationStates(item: Item): { status?: string; message?: string | null }[] {
  const states = Object.values(item.agentsStates ?? {});
  if (states.length || item.agentStatus == null) return states;
  if (typeof item.agentStatus === "string") return [{ status: item.agentStatus }];
  if (typeof item.agentStatus !== "object" || Array.isArray(item.agentStatus)) return [];
  const state = item.agentStatus as Record<string, unknown>;
  return [{ status: typeof state.status === "string" ? state.status : undefined,
    message: typeof state.message === "string" ? state.message : undefined }];
}
