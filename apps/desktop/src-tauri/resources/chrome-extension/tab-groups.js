import { t } from './i18n.js';

const WORK_GROUPS_KEY = 'browserWorkGroups';
const WORK_TABS_KEY = 'browserWorkTabs';
const WORK_GROUP_TITLE = 'Interlude';
const LEGACY_GROUP_TITLE = 'Codex';
const WORK_GROUP_COLOR = 'green';
let changes = Promise.resolve();

// Serializing group creation avoids duplicate groups and lost session records on concurrent opens.
export function groupNewTab(clientId, tab) {
  return serialize(() => assignGroup(clientId, tab));
}

// Only capture children created during an assistant input operation. Watching an opener forever
// would also claim pages the user later opens manually, including pages in the same work group.
export async function withNewTabs(context, openerTabId, operation) {
  const owner = await workTabOwner(openerTabId);
  if (owner && owner !== context.clientId) return operation();
  const created = new Set();
  // tabs.Tab.openerTabId can point at the selected tab when input targets a background page.
  // The navigation event identifies the actual source, including noopener links and frames.
  const listener = details => {
    if (details.sourceTabId === openerTabId) created.add(details.tabId);
  };
  chrome.webNavigation.onCreatedNavigationTarget.addListener(listener);
  try {
    return await operation();
  } finally {
    chrome.webNavigation.onCreatedNavigationTarget.removeListener(listener);
    // Even failed/cancelled input can have opened a page. Save its ownership for explicit cleanup.
    if (created.size) {
      try { await serialize(() => registerCreatedTabs(context.clientId, created)); }
      catch { throw new Error(t('organizeNewTabsFailed')); }
    }
  }
}

async function registerCreatedTabs(clientId, created) {
  const live = await chrome.tabs.query({});
  const stored = await chrome.storage.session.get(WORK_TABS_KEY);
  const records = stored[WORK_TABS_KEY] ?? [];
  const tabs = live.filter(tab => created.has(tab.id) && !records.some(record => record.tabId === tab.id));
  if (!tabs.length) return;
  // Save before grouping: a popup window cannot be grouped, and a grouping failure must not
  // make an already-opened task page indistinguishable from a user page at completion.
  await chrome.storage.session.set({ [WORK_TABS_KEY]: [
    ...records, ...tabs.map(tab => ({ clientId, tabId: tab.id })),
  ] });
  for (const tab of tabs) {
    const window = await chrome.windows.get(tab.windowId);
    if (window.type === 'normal') await assignGroup(clientId, tab);
  }
}

function serialize(operation) {
  const next = changes.catch(() => {}).then(operation);
  changes = next;
  return next;
}

async function assignGroup(clientId, tab) {
  const stored = await chrome.storage.session.get([WORK_GROUPS_KEY, WORK_TABS_KEY]);
  const liveGroups = await chrome.tabGroups.query({});
  const groups = (stored[WORK_GROUPS_KEY] ?? []).filter((record) =>
    liveGroups.some((group) => group.id === record.groupId && group.windowId === record.windowId));
  const existing = groups.find((record) => record.clientId === clientId && record.windowId === tab.windowId);
  // Only reuse recorded groups; a user-created group with the same title remains untouched.
  const groupId = await chrome.tabs.group({ tabIds: [tab.id],
    ...(existing ? { groupId: existing.groupId } : { createProperties: { windowId: tab.windowId } }) });
  if (!existing) {
    await chrome.tabGroups.update(groupId, { title: WORK_GROUP_TITLE, color: WORK_GROUP_COLOR });
    groups.push({ clientId, windowId: tab.windowId, groupId });
  } else if (liveGroups.find(group => group.id === groupId)?.title === LEGACY_GROUP_TITLE) {
    await chrome.tabGroups.update(groupId, { title: WORK_GROUP_TITLE });
  }
  const tabs = (stored[WORK_TABS_KEY] ?? []).filter(record => record.tabId !== tab.id);
  tabs.push({ clientId, tabId: tab.id });
  await chrome.storage.session.set({ [WORK_GROUPS_KEY]: groups, [WORK_TABS_KEY]: tabs });
  return groupId;
}

export function renameWorkGroups() {
  return serialize(async () => {
    const stored = await chrome.storage.session.get(WORK_GROUPS_KEY);
    const liveGroups = await chrome.tabGroups.query({});
    for (const record of stored[WORK_GROUPS_KEY] ?? []) {
      const group = liveGroups.find(group => group.id === record.groupId);
      if (group?.title === LEGACY_GROUP_TITLE) {
        await chrome.tabGroups.update(group.id, { title: WORK_GROUP_TITLE });
      }
    }
  });
}

export async function workTabOwner(tabId) {
  const stored = await chrome.storage.session.get(WORK_TABS_KEY);
  return (stored[WORK_TABS_KEY] ?? []).find(record => record.tabId === tabId)?.clientId;
}

export function forgetWorkTab(tabId) {
  return serialize(async () => {
    const stored = await chrome.storage.session.get([WORK_GROUPS_KEY, WORK_TABS_KEY]);
    const liveGroups = await chrome.tabGroups.query({});
    await chrome.storage.session.set({
      [WORK_TABS_KEY]: (stored[WORK_TABS_KEY] ?? []).filter(record => record.tabId !== tabId),
      [WORK_GROUPS_KEY]: (stored[WORK_GROUPS_KEY] ?? [])
        .filter(record => liveGroups.some(group => group.id === record.groupId)),
    });
  });
}
