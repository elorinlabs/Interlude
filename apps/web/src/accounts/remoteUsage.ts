import { displayError } from '../i18n/index';
import { apiJson, deviceStatusWebSocketUrl, getActiveSession } from '../api';
import { t } from '../i18n';
import type { AccountSummary, AuthSession, RemoteDevice, UsageSummary } from '../types';

const CONNECT_TIMEOUT_MS = 15_000;
const OPERATION_TIMEOUT_MS = 185_000;
const CONCURRENCY = 4;

export type UsageAction = 'refresh' | 'consume';
interface UsageResult { usage: UsageSummary | null; consumed: boolean; error: string | null }
interface Pending { resolve: (value: UsageResult) => void; reject: (error: Error) => void; timer: number }
export interface UsageBatchResult { accounts: AccountSummary[]; failed: number; consumed: number }

export function usageOwner() {
  const session = getActiveSession();
  return session ? JSON.stringify([session.baseUrl, session.email.toLowerCase()]) : null;
}

export function assertUsageOwner(owner: string | null) {
  if (!owner || owner !== usageOwner()) throw new Error(t("client.runtimeErrors.yourSessionChangedReconnectToContinue"));
}

export function selectUsageDevice(devices: RemoteDevice[], selectedId: string | null) {
  return devices.find(item => item.deviceId === selectedId && item.online)
    ?? devices.find(item => item.online);
}

export function usageDevice(devices: RemoteDevice[], selectedId: string | null) {
  const device = selectUsageDevice(devices, selectedId);
  if (!device?.online) {
    throw new Error(t("client.accountUsage.noComputersAreOnlineOpenInterludeOnYourComputer"));
  }
  if (!device.capabilities.includes('account-usage')) {
    throw new Error(t("client.accountUsage.updateInterludeOnYourComputerToManageAccountUsage"));
  }
  return device;
}

class UsageConnection {
  private readonly socket: WebSocket;
  private readonly pending = new Map<string, Pending>();
  private readonly ready: Promise<void>;
  private readonly owner = usageOwner();
  private sequence = 0;

  constructor(session: AuthSession) {
    this.socket = new WebSocket(deviceStatusWebSocketUrl(session.baseUrl));
    this.ready = new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        reject(new Error(t("client.accountUsage.connectingToTheComputerTimedOutPleaseTryAgainLater")));
        this.close();
      }, CONNECT_TIMEOUT_MS);
      this.socket.onopen = () => this.socket.send(JSON.stringify({
        type: 'subscribe-devices', accessToken: session.accessToken,
      }));
      this.socket.onmessage = event => {
        let value: unknown;
        try { value = JSON.parse(String(event.data)); }
        catch { return; }
        if (!value || typeof value !== 'object') return;
        const message = value as Record<string, unknown>;
        if (message.type === 'devices-snapshot') { window.clearTimeout(timeout); resolve(); }
        if (message.type === 'account-usage-result') this.receive(message);
      };
      this.socket.onerror = () => this.socket.close();
      this.socket.onclose = () => {
        window.clearTimeout(timeout);
        const error = new Error(t("client.accountUsage.disconnectedRefreshUsageBeforeConsumingAgainToAvoidADuplicate"));
        reject(error);
        for (const pending of this.pending.values()) {
          window.clearTimeout(pending.timer);
          pending.reject(error);
        }
        this.pending.clear();
      };
    });
  }

  private receive(message: Record<string, unknown>) {
    const id = String(message.requestId);
    const pending = this.pending.get(id);
    if (!pending) return;
    this.pending.delete(id);
    window.clearTimeout(pending.timer);
    if (typeof message.error === 'string' && message.error) pending.reject(new Error(displayError(message.error)));
    else if (message.data && typeof message.data === 'object') pending.resolve(message.data as UsageResult);
    else pending.reject(new Error(t("client.accountUsage.theComputerReturnedInvalidUsagePleaseRefreshAgainLater")));
  }

  async request(deviceId: string, accountId: string, action: UsageAction): Promise<UsageResult> {
    await this.ready;
    assertUsageOwner(this.owner);
    if (this.socket.readyState !== WebSocket.OPEN) throw new Error(t("client.accountUsage.theComputerDisconnectedPleaseReconnect"));
    const requestId = `usage-${++this.sequence}`;
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(t("client.accountUsage.theComputerHasNotConfirmedTheResultRefreshUsageBefore")));
      }, OPERATION_TIMEOUT_MS);
      this.pending.set(requestId, { resolve, reject, timer });
      this.socket.send(JSON.stringify({ type: 'account-usage', requestId, deviceId, accountId, action }));
    });
  }

  close() { this.socket.close(); }
}

async function updateAccount(connection: UsageConnection, account: AccountSummary,
  target: { deviceId: string; action: UsageAction }) {
  try {
    const result = await connection.request(target.deviceId, account.id, target.action);
    const error = result.error || result.usage?.error || (!result.usage ? t("client.accountUsage.couldNotRefreshUsagePleaseTryAgainLater") : null);
    return { account: { ...account, plan: result.usage?.plan ?? account.plan,
      usage: { ...(result.usage ?? account.usage), error } },
      consumed: result.consumed === true, failed: Boolean(error) };
  } catch (error) {
    return { account: { ...account, usage: { ...account.usage,
      error: error instanceof Error ? error.message : t("client.accountUsage.couldNotRefreshUsagePleaseTryAgainLater") } }, consumed: false, failed: true };
  }
}

export async function runRemoteUsage(options: {
  accounts: AccountSummary[]; devices: RemoteDevice[]; selectedDeviceId: string | null; action: UsageAction;
}): Promise<UsageBatchResult> {
  if (!options.accounts.length) return { accounts: [], failed: 0, consumed: 0 };
  const device = usageDevice(options.devices, options.selectedDeviceId);
  const owner = usageOwner();
  // Refresh expired authorization before opening the control connection; never replay a consumption request.
  await apiJson('/auth/me');
  assertUsageOwner(owner);
  const session = getActiveSession();
  if (!session) throw new Error(t("client.app.pleaseSignInFirst"));
  const connection = new UsageConnection(session);
  const result: UsageBatchResult = { accounts: new Array(options.accounts.length), failed: 0, consumed: 0 };
  let cursor = 0;
  try {
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, options.accounts.length) }, async () => {
      while (cursor < options.accounts.length) {
        const index = cursor++;
        const updated = await updateAccount(connection, options.accounts[index], {
          deviceId: device.deviceId, action: options.action,
        });
        result.accounts[index] = updated.account;
        result.failed += Number(updated.failed);
        result.consumed += Number(updated.consumed);
      }
    }));
    assertUsageOwner(owner);
    return result;
  } finally { connection.close(); }
}

/** Cloud sync may arrive later than the direct PC reply; keep the newer usage. */
export function preserveLatestUsage(accounts: AccountSummary[], current: AccountSummary[]) {
  const previous = new Map(current.map(account => [account.id, account]));
  return accounts.map(account => {
    const prior = previous.get(account.id);
    return prior && Date.parse(prior.usage.fetchedAt ?? '') > (Date.parse(account.usage.fetchedAt ?? '') || 0)
      ? { ...account, plan: prior.plan, usage: prior.usage } : account;
  });
}

export function usageUpdatedAt(accounts: AccountSummary[]) {
  const timestamps = accounts.map(account => Date.parse(account.usage.fetchedAt ?? '')).filter(Number.isFinite);
  return timestamps.length ? Math.max(...timestamps) : null;
}
