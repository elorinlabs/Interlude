import { ALL_WEBSITES } from './site-access.js';
import { localizeDocument, t } from './i18n.js';

localizeDocument();
const error = document.querySelector('#error');
const allowAll = document.querySelector('#allow-all');
let paused = false;
let refreshing = false;
const REFRESH_INTERVAL_MS = 2000;

async function send(message) {
  const reply = await chrome.runtime.sendMessage(message);
  if (reply.error) throw new Error(reply.error);
  return reply.result;
}

function rows(container, items, label, action, handler) {
  container.replaceChildren();
  if (!items.length) { container.textContent = t('listEmpty'); return; }
  for (const item of items) {
    const row = document.createElement('div'); row.className = 'row';
    const text = document.createElement('span'); text.textContent = label(item);
    const button = document.createElement('button'); button.textContent = action; button.className = 'secondary';
    button.addEventListener('click', () => perform(() => handler(item)));
    row.append(text, button); container.append(row);
  }
}

async function refresh() {
  if (refreshing) return;
  refreshing = true;
  try { renderStatus(await send({ operation: 'status' })); }
  finally { refreshing = false; }
}

function renderStatus(state) {
  paused = state.paused;
  document.querySelector('#status').textContent = state.connected
    ? paused ? t('statusPaused') : t('statusWaiting')
    : t('statusDisconnected');
  document.querySelector('#pause').textContent = paused
    ? t('resumeControl') : t('pauseControl');
  allowAll.checked = state.allSitesAllowed;
  document.querySelector('#site-details').hidden = state.allSitesAllowed;
  error.hidden = !state.connectionError;
  error.textContent = state.connectionError;
  rows(document.querySelector('#requests'), state.pending, (item) => item.origin, t('reviewRequest'), (item) =>
    chrome.windows.create({ url: chrome.runtime.getURL(`approval.html?id=${item.id}`), type: 'popup', width: 400, height: 520 }));
  rows(document.querySelector('#origins'), state.allowedOrigins, (origin) => origin, t('revokeAccess'), (origin) =>
    send({ operation: 'revoke', origin }));
}

async function perform(action) {
  try { await action(); await refresh(); }
  catch (caught) { showError(caught); }
}

function showError(caught) { error.hidden = false; error.textContent = caught.message; }
function refreshVisible() {
  if (document.visibilityState === 'visible' && !window.frameElement?.hidden) void refresh().catch(showError);
}

document.querySelector('#connect').addEventListener('click', () => perform(() => send({ operation: 'connect' })));
document.querySelector('#pause').addEventListener('click', () => perform(() => send({ operation: 'pause', paused: !paused })));
allowAll.addEventListener('change', () => {
  const requested = allowAll.checked;
  void perform(async () => {
    // Call Chrome directly from the user's gesture when required host permissions were withheld.
    if (requested && !await chrome.permissions.request(ALL_WEBSITES)) return;
    await send({ operation: 'siteAccess', allowAll: requested });
  });
});
document.querySelector('#save-name').addEventListener('click', () => perform(() =>
  send({ operation: 'profileName', name: document.querySelector('#name').value })));
const { profileName = 'Chrome' } = await chrome.storage.local.get('profileName');
document.querySelector('#name').value = profileName;
await refresh().catch(showError);
window.addEventListener('focus', refreshVisible);
const refreshTimer = setInterval(refreshVisible, REFRESH_INTERVAL_MS);
window.addEventListener('pagehide', () => clearInterval(refreshTimer));
