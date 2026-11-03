import type { ChatState } from './client/types';
import { CONNECTION_ERRORS } from './connectionErrors';
import { HOST_IDENTITY_CHANGED } from './trustedHost';

export type ConnectionStage = 'login' | 'computer' | 'path' | 'chat' | 'ready';
export type HealthStatus = 'ok' | 'waiting' | 'blocked';
export type HealthStepId = Exclude<ConnectionStage, 'ready'>;
export interface HealthStep { id: HealthStepId; label: string; status: HealthStatus; detail: string }
export interface ConnectionHealth {
  title: string;
  description: string;
  status: HealthStatus;
  nextTitle: string;
  next: string;
  steps: HealthStep[];
  reconnect: boolean;
}

export const healthStatusLabels: Record<HealthStatus, string> = {
  ok: "client.mobile.active", waiting: "client.chatReliability.awaitingConfirmation", blocked: "client.chatReliability.needsAttention",
};
// Longer translations move below the description to keep the card readable on narrow screens.
export const HEALTH_INLINE_STATUS_MAX_CHARACTERS = 6;

const LOGIN_ERRORS: readonly string[] = [CONNECTION_ERRORS.authorization, CONNECTION_ERRORS.expired];
const COMPUTER_ERRORS: readonly string[] = [CONNECTION_ERRORS.unavailable, CONNECTION_ERRORS.interrupted];
const CHAT_ERRORS: readonly string[] = [CONNECTION_ERRORS.gui, CONNECTION_ERRORS.guiTimeout,
  CONNECTION_ERRORS.guiDisconnected, CONNECTION_ERRORS.missingGui, CONNECTION_ERRORS.startup,
  CONNECTION_ERRORS.workspace, CONNECTION_ERRORS.configuration];

export function liveChat(state: ChatState) {
  return state.ready && ['direct', 'relay'].includes(state.mode) && !state.historyOffline;
}

function connectionFacts(state: ChatState, device?: { online: boolean }) {
  const issue = state.connectionIssue ?? '';
  const path = state.mode === 'direct' || state.mode === 'relay';
  const ready = liveChat(state);
  const loginBlocked = !path && LOGIN_ERRORS.includes(issue);
  const computerBlocked = !path && (device?.online === false || COMPUTER_ERRORS.includes(issue));
  const loginOk = !loginBlocked && (path || ['path', 'chat', 'ready'].includes(state.connectionStage ?? ''));
  return { state, issue, ready, path, loginBlocked, computerBlocked, loginOk, device: Boolean(device) };
}

type Facts = ReturnType<typeof connectionFacts>;

function stepStatus(ok: boolean, blocked: boolean): HealthStep['status'] {
  if (ok) return 'ok';
  return blocked ? 'blocked' : 'waiting';
}

function loginStep(facts: Facts): HealthStep {
  const status = stepStatus(facts.loginOk, facts.loginBlocked);
  const details = { ok: "client.chatReliability.signInVerified", blocked: "client.chatReliability.signInAgainAndUseTheSameAccountOnBoth", waiting: "client.chatReliability.checkingSignIn" };
  return { id: 'login', label: "client.chatReliability.accountSignIn", status, detail: details[status] };
}

function computerStep(facts: Facts): HealthStep {
  const contacted = facts.path || (!facts.computerBlocked && facts.state.connectionStage === 'path');
  const status = stepStatus(contacted, facts.computerBlocked);
  const details = { ok: "client.chatReliability.computerReached", blocked: "client.chatReliability.wakeYourComputerConnectItToTheInternetAndKeep",
    waiting: "client.chatReliability.contactingYourComputerMakeSureItIsTurnedOn" };
  return { id: 'computer', label: "client.chatReliability.computerAvailability", status, detail: details[status] };
}

function pathStep(facts: Facts): HealthStep {
  let detail = "client.chatReliability.tryingDirectAndRelayConnections";
  if (facts.path) detail = facts.state.mode === 'direct' ? "client.chatReliability.connectedDirectlyToYourComputer" : "client.chatReliability.connectedThroughARelayChatIsAvailable";
  return { id: 'path', label: "client.chatReliability.connectionRoute", status: stepStatus(facts.path, false), detail };
}

function chatStep(facts: Facts): HealthStep {
  const ready = facts.ready && !facts.state.desktopOnly;
  return { id: 'chat', label: "client.chatReliability.chatOnComputer", status: stepStatus(ready, CHAT_ERRORS.includes(facts.issue)),
    detail: ready ? "client.chatReliability.chatIsReady" : "client.chatReliability.tasksMessagesAndApprovalsWillSyncOnceConnected" };
}

/** Live transport evidence takes precedence over potentially stale presence records. */
export function connectionHealth(state: ChatState, device?: { online: boolean }): ConnectionHealth {
  const facts = connectionFacts(state, device);
  const steps = [loginStep(facts), computerStep(facts), pathStep(facts), chatStep(facts)];
  const status = healthStatus(facts, steps);
  const description = {
    ok: "client.chatReliability.yourConnectionIsWorkingChatAndTasksAreAvailable",
    waiting: "client.chatReliability.checkingYourConnectionPleaseWait",
    blocked: "client.chatReliability.theConnectionIsNotReadySeeTheGuidanceBelow",
  }[status];
  return { ...healthSummary(facts), description, status, steps,
    nextTitle: status === 'ok' ? "client.chatReliability.connectedYouCanSendTasks" : "client.chatReliability.whatYouCanDoNext",
    reconnect: Boolean(device) && !facts.ready && !state.connecting };
}

function healthStatus(facts: Facts, steps: HealthStep[]): HealthStatus {
  if (!facts.device) return 'waiting';
  if (facts.state.desktopOnly || facts.issue === HOST_IDENTITY_CHANGED) return 'blocked';
  if (steps.every(step => step.status === 'ok')) return 'ok';
  const needsAttention = facts.issue === CONNECTION_ERRORS.network || facts.issue === CONNECTION_ERRORS.server
    || steps.some(step => step.status === 'blocked');
  return needsAttention ? 'blocked' : 'waiting';
}

function healthSummary(input: Facts) {
  const { state, issue, loginBlocked } = input;
  if (!input.device) return { title: "client.chatReliability.noComputerSelected", next: "client.chatReliability.chooseAComputerToConnectTo" };
  if (loginBlocked) return { title: "client.chatReliability.signInAgain", next: "client.chatReliability.returnToYourAccountPageSignInAgainThenConnect" };
  if (issue === HOST_IDENTITY_CHANGED) return { title: "client.chatReliability.verifyComputerIdentity", next: "client.chatReliability.closeThisCheckAndChooseVerifyComputerIdentityToContinue" };
  if (state.desktopOnly) return { title: "client.chatReliability.computerSignInRequired", next: "client.chatReliability.openRemoteDesktopSignInToTheComputerThenConnect" };
  return transportSummary(input);
}

function transportSummary({ state, issue, ready, path, computerBlocked }: Facts) {
  if (ready) return { title: state.mode === 'direct' ? "client.chatReliability.connectedDirectly" : "client.chatReliability.connectedThroughRelay",
    next: state.mode === 'direct' ? "client.chatReliability.chatAndTasksAreAvailable" : "client.chatReliability.aiCanRunThroughARelayConnection" };
  if (computerBlocked) return { title: "client.chatReliability.computerUnreachable", next: "client.chatReliability.wakeYourComputerOpenInterludeThenChooseReconnect" };
  if (path) return { title: "client.chatReliability.restoringChatOnYourComputer", next: CHAT_ERRORS.includes(issue)
    ? issue : "client.chatReliability.pleaseWaitIfThisPersistsOpenChatOnYourComputer" };
  if (issue === CONNECTION_ERRORS.network || issue === CONNECTION_ERRORS.server) {
    return { title: "client.chatReliability.chatServiceUnreachable", next: "client.chatReliability.checkYourNetworkAndServerAddressThenReconnect" };
  }
  return { title: "client.chatReliability.connecting", next: "client.chatReliability.keepBothDevicesOnlineChooseReconnectToTryAgain" };
}
