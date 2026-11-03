import { assertRunning } from './permissions.js';
import { clearControlledTabs } from './tab-indicator.js';
import { clearTabPointer } from './pointer.js';
import { t } from './i18n.js';

const connections = new Map();
const keyOf = target => target.tabId === undefined ? `worker:${target.targetId}` : `tab:${target.tabId}`;
export const connectionOwner = context => context.sessionId
  ? `${context.clientId}:${context.sessionId}` : context.clientId;

// Callers serialize operations per target. Retain only the transport between operations;
// page overrides, protocol subscriptions and frame sessions remain request-scoped.
export async function acquireConnection(target, signal, clientId) {
  const key = keyOf(target);
  let connection = connections.get(key);
  if (connection?.closed) {
    await closeConnection(connection);
    connection = undefined;
  }
  assertRunning(signal);
  if (!connection) {
    connection = { target, key, closed: false, detached: false, closing: null, clients: new Set() };
    connections.set(key, connection);
    connection.attaching = chrome.debugger.attach(target, '1.3');
  }
  connection.clients.add(clientId);
  try {
    await connection.attaching;
    assertRunning(signal);
    assertConnected(connection);
    return connection;
  } catch (error) {
    await finishConnection(target, clientId);
    throw error;
  }
}

export function assertConnected(connection) {
  if (connection.closed) throw new Error(t('browserConnectionEnded'));
}

export function releaseConnection(connection, keepAlive, clientId) {
  if (connection.closed) return closeConnection(connection);
  if (!keepAlive) return finishConnection(connection.target, clientId);
  // Reasoning and other tools can take arbitrarily long between browser actions.
  // Keep Chrome's banner stable until explicit task completion or a stop decision.
}

export async function finishClientConnections(clientId) {
  await Promise.all([...connections.values()]
    .filter(connection => connection.clients.has(clientId))
    .map(connection => finishConnection(connection.target, clientId)));
}

export async function finishConnection(target, clientId) {
  const connection = connections.get(keyOf(target));
  if (!connection) return true;
  connection.clients.delete(clientId);
  if (connection.clients.size) return false;
  await closeConnection(connection);
  return true;
}

export function closeConnection(connection) {
  if (connection.closing) return connection.closing;
  connection.closed = true;
  connection.closing = detach(connection).finally(() => {
    if (connections.get(connection.key) === connection) connections.delete(connection.key);
  });
  return connection.closing;
}

async function detach(connection) {
  try {
    await connection.attaching;
    if (!connection.detached) await chrome.debugger.detach(connection.target);
  } catch {
    // Attach failure, tab/worker closure and Chrome's Cancel button can detach first.
  }
  if (connection.target.tabId !== undefined) {
    await clearTabPointer(connection.target.tabId);
    await clearControlledTabs(connection.target.tabId);
  }
}

export function debuggerDetached(target) {
  const connection = connections.get(keyOf(target));
  if (!connection) return;
  connection.detached = true;
  return closeConnection(connection);
}

export function hasDebuggerConnections() {
  return connections.size > 0;
}

export async function stopConnections() {
  await Promise.all([...connections.values()].map(closeConnection));
}
