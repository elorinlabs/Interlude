import { uiText } from "../../i18n/uiText";
import type { Conversation, GuiEvent, Item, Turn } from "./types";
import { SECOND_MS } from "./turnTiming";

export const PROCESSING_LABELS = {
  get sending() { return uiText("client.shared.sendingRequest"); }, get request() { return uiText("client.shared.waitingForResponse"); }, get reasoning() { return uiText("client.shared.thinking"); }, get response() { return uiText("client.shared.generatingReply"); },
  get command() { return uiText("client.shared.runningCommand"); }, get files() { return uiText("client.shared.editingFiles"); }, get tool() { return uiText("client.shared.usingTool"); }, get search() { return uiText("client.shared.searchingTheWeb"); },
  get image() { return uiText("client.shared.generatingImage"); }, get collaboration() { return uiText("client.shared.waitingForCollaboration"); }, get compact() { return uiText("client.shared.compactingContext"); },
  get approval() { return uiText("client.chatReliability.awaitingYourApproval"); }, get input() { return uiText("client.shared.waitingForYourInput"); }, get retry() { return uiText("client.shared.retrying"); }, get wait() { return uiText("client.shared.waiting"); },
  get processing() { return uiText("client.shared.codexIsWorking"); },
};
export type ProcessingPhase = keyof typeof PROCESSING_LABELS;
interface Activity { id: string; phase: ProcessingPhase }
export interface ProcessingState extends Activity {
  turnId: string;
  startedAtMs: number;
  activities: Activity[];
  completedIds: string[];
}
export interface PendingRequest { threadId: string | null; startedAtMs: number }

const ITEM_PHASES: Record<string, ProcessingPhase> = {
  reasoning: "reasoning", agentMessage: "response", plan: "reasoning", commandExecution: "command",
  fileChange: "files", mcpToolCall: "tool", dynamicToolCall: "tool", webSearch: "search",
  imageGeneration: "image", imageView: "tool", contextCompaction: "compact", sleep: "wait",
  collabAgentToolCall: "collaboration", collabToolCall: "collaboration", subAgentActivity: "collaboration",
};
const FINISHED = new Set(["completed", "failed", "declined", "interrupted"]);
const WAITING: Activity = { id: "request", phase: "request" };

function currentActivity(activities: Activity[]): Activity {
  return [...activities].reverse().find((item) => item.phase === "approval" || item.phase === "input")
    ?? activities.at(-1) ?? WAITING;
}

function selectActivity(state: ProcessingState, activities: Activity[]): ProcessingState {
  const next = currentActivity(activities);
  const unchanged = state.id === next.id && state.phase === next.phase;
  return { ...state, ...next, activities, startedAtMs: unchanged ? state.startedAtMs : Date.now() };
}

/** Preserve observed phase timing across view switches; history has no per-item start timestamps. */
export function restoreProcessing(turn: Turn, previous?: ProcessingState): ProcessingState {
  if (previous?.turnId === turn.id) return previous;
  const activities = turn.items.filter((item) => item.status === "inProgress" && item.type !== "userMessage")
    .map((item) => ({ id: item.id, phase: ITEM_PHASES[item.type] ?? "processing" }));
  const current = currentActivity(activities);
  const hasActivity = turn.items.some((item) => item.type !== "userMessage");
  return { ...current, turnId: turn.id, activities,
    completedIds: turn.items.filter((item) => FINISHED.has(item.status ?? "")).map((item) => item.id),
    startedAtMs: hasActivity ? Date.now() : (turn.startedAt ?? Date.now() / SECOND_MS) * SECOND_MS };
}

function updateActivity(state: ProcessingState, item: Item, completed: boolean): ProcessingState {
  if (item.type === "userMessage") return state;
  if (state.completedIds.includes(item.id)) return state;
  const existing = state.activities.find((entry) => entry.id === item.id);
  const activities = state.activities.filter((entry) => entry.id !== item.id);
  if (completed) return { ...(existing ? selectActivity(state, activities) : state),
    completedIds: [...state.completedIds, item.id] };
  // Streaming chunks update content, not the start time or priority of an already running activity.
  if (existing) return state;
  return selectActivity(state, [...activities, { id: item.id, phase: ITEM_PHASES[item.type] ?? "processing" }]);
}

export function trackProcessing(value: Conversation, event: GuiEvent): Conversation {
  const turn = value.turns.find((entry) => entry.id === value.activeTurn);
  if (!turn) return value.processing ? { ...value, processing: undefined } : value;
  const state = restoreProcessing(turn, value.processing);
  if (event.params.turnId && event.params.turnId !== turn.id) return value;
  const { method, params } = event;
  let processing = state;
  if (method === "error" && params.willRetry) {
    processing = { ...state, id: "retry", phase: "retry", activities: [],
      startedAtMs: state.phase === "retry" ? state.startedAtMs : Date.now() };
  } else if (method.startsWith("item/")) {
    const item = params.item ?? turn.items.find((entry) => entry.id === params.itemId);
    if (item) processing = updateActivity(state, item, method === "item/completed" || FINISHED.has(item.status ?? ""));
  }
  return processing === value.processing ? value : { ...value, processing };
}

export function processingApproval(state: ProcessingState, event: GuiEvent, resolved = false): ProcessingState {
  const id = `approval:${event.id}`;
  const activities = state.activities.filter((entry) => entry.id !== id);
  if (resolved) return selectActivity(state, activities);
  if (activities.length !== state.activities.length) return state;
  const phase = event.method === "item/tool/requestUserInput" ? "input" : "approval";
  return selectActivity(state, [...activities, { id, phase }]);
}
