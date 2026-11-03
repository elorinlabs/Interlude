const CONTROLLED_TABS_KEY = 'controlledTabs';
const ICON_COLOR = '#16a34a';
const CURSOR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">`
  + `<path d="M7 3v24l7-7 5 10 5-2-5-10h9L7 3Z" fill="white" stroke="${ICON_COLOR}" `
  + `stroke-width="2.5" stroke-linejoin="round"/></svg>`;
const ICON_URL = `data:image/svg+xml,${encodeURIComponent(CURSOR_SVG)}`;
let changes = Promise.resolve();

function serialize(operation) {
  const next = changes.catch(() => {}).then(operation);
  changes = next;
  return next;
}

// Runs in the extension's isolated world, preserving the site's original icon nodes.
export function updatePageIcon(iconUrl) {
  const key = '__codexSwitchTabIcon';
  globalThis[key]?.restore();
  if (!iconUrl || !document.head) return;
  const originals = [...document.querySelectorAll('link[rel~="icon"]')];
  const icon = document.createElement('link');
  icon.rel = 'icon';
  icon.type = 'image/svg+xml';
  icon.href = iconUrl;
  const repairDelayMs = 50;
  const repairWindowMs = 1000;
  const maxRepairs = 4;
  let timer;
  let repairs = [];
  const observer = new MutationObserver(() => {
    if (timer !== undefined) return;
    // Another extension world (including an unloaded version) may also enforce its icon.
    // Mutating in this callback can starve the renderer's task queue indefinitely.
    timer = setTimeout(() => {
      timer = undefined;
      const others = [...document.querySelectorAll('link[rel~="icon"]')].filter(node => node !== icon);
      if (!others.length && icon.isConnected) return;
      const now = Date.now();
      repairs = repairs.filter(time => now - time < repairWindowMs);
      if (repairs.length >= maxRepairs) { globalThis[key]?.restore(); return; }
      repairs.push(now);
      for (const node of others) {
        if (!originals.includes(node)) originals.push(node);
        node.remove();
      }
      if (!icon.isConnected) document.head.append(icon);
    }, repairDelayMs);
  });
  for (const node of originals) node.remove();
  document.head.append(icon);
  observer.observe(document.head, { childList: true, subtree: true, attributes: true,
    attributeFilter: ['rel', 'href'] });
  globalThis[key] = { restore: () => {
    observer.disconnect();
    clearTimeout(timer);
    icon.remove();
    for (const node of originals) document.head.append(node);
    delete globalThis[key];
  } };
}

async function apply(tabId, enabled) {
  await chrome.scripting.executeScript({ target: { tabId }, func: updatePageIcon,
    args: [enabled ? ICON_URL : null] });
}

export function markControlledTab(tabId) {
  return serialize(async () => {
    const { controlledTabs = [] } = await chrome.storage.session.get(CONTROLLED_TABS_KEY);
    await apply(tabId, true);
    await chrome.storage.session.set({ controlledTabs: [...new Set([...controlledTabs, tabId])] });
  });
}

export function clearControlledTabs(tabId) {
  return serialize(async () => {
    const { controlledTabs = [] } = await chrome.storage.session.get(CONTROLLED_TABS_KEY);
    const removed = controlledTabs.filter((id) => tabId === undefined || id === tabId);
    // Closed tabs and revoked site permissions can prevent cleanup; their document is no longer controlled.
    await Promise.allSettled(removed.map((id) => apply(id, false)));
    await chrome.storage.session.set({ controlledTabs: controlledTabs.filter((id) => !removed.includes(id)) });
  });
}
