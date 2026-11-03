import { authorize, assertRunning } from './permissions.js';
import { createFrameSessions } from './frame-sessions.js';
import { markControlledTab, clearControlledTabs } from './tab-indicator.js';
import { prepareBackgroundPage, restoreBackgroundPage, settleRendering } from './rendering.js';
import { acquireConnection, assertConnected, finishConnection, releaseConnection,
  stopConnections, connectionOwner } from './debugger-connections.js';
import { queueTarget } from './target-queue.js';
import { withNewTabs } from './tab-groups.js';
import { t } from './i18n.js';

export function withTab(context, args, operation, options = {}) {
  return queueTarget({ tabId: args.tabId }, () => run(context, args, operation, options));
}

async function run(context, args, operation, { prepareInput = true, trackNewTabs = false }) {
  const tab = await chrome.tabs.get(args.tabId);
  await authorize(tab.url, context.clientId, context.signal);
  const target = { tabId: tab.id };
  const owner = connectionOwner(context);
  const connection = await acquireConnection(target, context.signal, owner).catch(() => {
    assertRunning(context.signal);
    throw new Error(t('tabConnectFailed'));
  });
  // Detaching also releases commands held open by a page dialog when the user cancels.
  const abort = () => { void finishConnection(target, owner); };
  context.signal?.addEventListener('abort', abort, { once: true });
  if (context.signal?.aborted) abort();
  const guard = async (options) => {
    assertRunning(context.signal);
    assertConnected(connection);
    const current = await chrome.tabs.get(tab.id);
    await authorize(current.url, context.clientId, context.signal, options);
  };
  const sessions = createFrameSessions(target, guard);
  let viewportOverridden = false;
  try {
    await guard();
    // Log reads need no focus emulation, viewport changes or page JavaScript execution.
    if (prepareInput) viewportOverridden = await prepareBackgroundPage({ tab, send: sessions.send });
    await markControlledTab(tab.id);
    await sessions.initialize();
    const driver = { tab, send: sessions.send, documents: sessions.documents, listen: sessions.listen, context, guard,
      debuggee: sessions.debuggee, relatedFrames: sessions.relatedFrames };
    const result = await performOperation(driver, operation, { prepareInput, trackNewTabs });
    await guard();
    return result;
  } finally {
    const cleaned = await sessions.dispose();
    const restored = !prepareInput || await restoreBackgroundPage(target, viewportOverridden);
    // A stale reference or a wait timeout does not end the debugging task. Recheck access
    // before retaining the transport, even when the requested page action failed.
    const authorized = await guard({ prompt: false }).then(() => true, () => false);
    await releaseConnection(connection, authorized && cleaned && restored, owner);
    context.signal?.removeEventListener('abort', abort);
  }
}

async function performOperation(driver, operation, { prepareInput, trackNewTabs }) {
  const perform = async () => {
    const result = await operation(driver);
    if (prepareInput) await settleRendering(driver);
    return result;
  };
  return trackNewTabs ? withNewTabs(driver.context, driver.tab.id, perform) : perform();
}

export async function stopDebugging() {
  await stopConnections();
  await clearControlledTabs();
}

export async function pageCall(driver, ref, functionDeclaration, args = []) {
  const resolved = await driver.send('DOM.resolveNode', { backendNodeId: ref.nodeId }, ref.frameId);
  const objectId = resolved.object.objectId;
  try {
    const response = await driver.send('Runtime.callFunctionOn', { objectId, functionDeclaration,
      arguments: args.map((value) => ({ value })), returnByValue: true, awaitPromise: true }, ref.frameId);
    if (response.exceptionDetails) throw new Error(t('elementActionFailed'));
    return response.result.value;
  } finally {
    await driver.send('Runtime.releaseObject', { objectId }, ref.frameId).catch(() => {});
  }
}
