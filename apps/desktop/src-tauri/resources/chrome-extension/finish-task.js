import { assertRunning } from './permissions.js';
import { workTabOwner, forgetWorkTab } from './tab-groups.js';
import { finishConnection, connectionOwner } from './debugger-connections.js';
import { queueTarget } from './target-queue.js';
import { invalidate } from './snapshot.js';

export async function finishTask(context, args) {
  const result = { closedTabIds: [], keptTabIds: [], releasedWorkerIds: [], failedTabIds: [], failedWorkerIds: [] };
  for (const tabId of args.tabIds) {
    await queueTarget({ tabId }, async () => {
      assertRunning(context.signal);
      try {
        const closed = await finishTab(context, tabId, args.keepTabIds?.includes(tabId));
        result[closed ? 'closedTabIds' : 'keptTabIds'].push(tabId);
      } catch {
        // Preserve ownership on failure so a retry can still reclaim this exact tab.
        result.failedTabIds.push(tabId);
      }
    });
  }
  for (const targetId of args.workerIds ?? []) {
    await queueTarget({ targetId }, async () => {
      assertRunning(context.signal);
      try {
        const released = await finishConnection({ targetId }, connectionOwner(context));
        result[released ? 'releasedWorkerIds' : 'failedWorkerIds'].push(targetId);
      } catch { result.failedWorkerIds.push(targetId); }
    });
  }
  return result;
}

async function finishTab(context, tabId, keep) {
  const { clientId, signal } = context;
  const owner = await workTabOwner(tabId);
  const released = await finishConnection({ tabId }, connectionOwner(context));
  assertRunning(signal);
  // Group membership is not ownership: users can move their own pages into a work group.
  if (!released || (owner && owner !== clientId)) return false;
  if (!owner || keep) {
    if (keep && owner === clientId) await forgetWorkTab(tabId);
    return false;
  }
  const tabs = await chrome.tabs.query({});
  assertRunning(signal);
  if (tabs.some(tab => tab.id === tabId)) await chrome.tabs.remove(tabId);
  invalidate(tabId);
  await forgetWorkTab(tabId);
  return true;
}
