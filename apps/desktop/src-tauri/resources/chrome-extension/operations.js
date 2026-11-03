import { authorize, assertRunning, status } from './permissions.js';
import { validate, website } from './validation.js';
import { withTab } from './driver.js';
import { groupNewTab } from './tab-groups.js';
import { snapshot, frames, invalidate } from './snapshot.js';
import { consoleLogs, standaloneWorkerLogs } from './console-logs.js';
import { listWorkers, withWorker } from './worker-driver.js';
import { finishTask } from './finish-task.js';
import { queueTarget } from './target-queue.js';
import * as actions from './actions.js';
import { t } from './i18n.js';

const MAX_SCREENSHOT_CHARACTERS = 12 * 1024 * 1024;
const INPUT_OPERATIONS = new Set(['click', 'key', 'fill', 'type', 'select', 'check', 'drag']);

export async function execute(context, request) {
  const { operation, args } = validate(request);
  if (operation === 'status') return status();
  assertRunning(context.signal);
  if (operation === 'finish') return finishTask(context, args);
  if (operation === 'tabs') return listTabs();
  if (operation === 'workers') return listWorkers();
  if (operation === 'console_logs' && args.workerId) {
    return withWorker(context, args, connection => standaloneWorkerLogs(connection, args));
  }
  if (operation === 'open') return open(context, args);
  if (['navigate', 'close', 'focus', 'reload'].includes(operation)) {
    return queueTarget({ tabId: args.tabId }, () => tabAction(context, operation, args));
  }
  return withTab(context, args, (driver) => pageAction(driver, operation, args),
    { prepareInput: operation !== 'console_logs', trackNewTabs: INPUT_OPERATIONS.has(operation) });
}

async function listTabs() {
  const tabs = await chrome.tabs.query({});
  return { tabs: tabs.map(({ id, windowId, groupId, url, title, active }) =>
    ({ tabId: id, windowId, groupId, url, title, active })) };
}

async function open(context, args) {
  const url = website(args.url).href;
  await authorize(url, context.clientId, context.signal);
  const tab = await chrome.tabs.create({ url, active: false });
  try {
    const groupId = await groupNewTab(context.clientId, tab);
    assertRunning(context.signal);
    if (args.background === false) await chrome.tabs.update(tab.id, { active: true });
    return { tabId: tab.id, windowId: tab.windowId, groupId, url };
  } catch {
    // A failed open must not leave an ungrouped task tab mixed in with the user's pages.
    try { await chrome.tabs.remove(tab.id); }
    catch { throw new Error(t('groupTabsFailed')); }
    assertRunning(context.signal);
    throw new Error(t('openGroupedTabFailed'));
  }
}

async function tabAction(context, operation, args) {
  const tab = await chrome.tabs.get(args.tabId);
  await authorize(tab.url, context.clientId, context.signal);
  if (operation === 'reload') {
    // Recovery must not depend on scripts or debugger commands in the stalled document.
    invalidate(tab.id);
    await chrome.tabs.reload(tab.id);
    return { reloaded: true };
  }
  if (operation === 'close') {
    await chrome.tabs.remove(tab.id);
    invalidate(tab.id);
    return { closed: true };
  }
  if (operation === 'focus') {
    await chrome.tabs.update(tab.id, { active: true });
    const window = await chrome.windows.get(tab.windowId);
    await chrome.windows.update(tab.windowId, { focused: true,
      ...(window.state === 'minimized' ? { state: 'normal' } : {}) });
    return { focused: true };
  }
  const url = website(args.url).href;
  await authorize(url, context.clientId, context.signal);
  invalidate(tab.id);
  await chrome.tabs.update(tab.id, { url });
  return { tabId: tab.id, url };
}

async function pageAction(driver, operation, args) {
  if (operation === 'snapshot') return snapshot(driver, args);
  if (operation === 'frames') return { frames: await frames(driver) };
  if (operation === 'console_logs') return consoleLogs(driver, args);
  if (operation === 'fill' || operation === 'type') return actions.fill(driver, args, operation === 'fill');
  if (['click', 'key', 'scroll', 'select', 'check', 'drag'].includes(operation)) {
    return actions[operation](driver, args);
  }
  if (operation === 'screenshot') {
    const result = await driver.send('Page.captureScreenshot', { format: 'jpeg', quality: 80,
      captureBeyondViewport: false, fromSurface: true });
    if (result.data.length > MAX_SCREENSHOT_CHARACTERS) throw new Error(t('screenshotTooLarge'));
    return { tabId: driver.tab.id, image: { mimeType: 'image/jpeg', data: result.data } };
  }
  if (operation === 'wait') return waitForText(driver, args);
  return history(driver, operation);
}

async function history(driver, operation) {
  const { entries, currentIndex } = await driver.send('Page.getNavigationHistory');
  const entry = entries[currentIndex + (operation === 'back' ? -1 : 1)];
  if (!entry) throw new Error(t('noHistoryEntry'));
  await authorize(entry.url, driver.context.clientId, driver.context.signal);
  invalidate(driver.tab.id);
  await driver.send('Page.navigateToHistoryEntry', { entryId: entry.id });
  return { url: entry.url };
}

async function waitForText(driver, args) {
  const deadline = Date.now() + (args.timeoutMs ?? 10000);
  while (Date.now() < deadline) {
    await driver.guard();
    const result = await snapshot(driver);
    if (result.text.includes(args.text)) return result;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(t('waitTimedOut'));
}
