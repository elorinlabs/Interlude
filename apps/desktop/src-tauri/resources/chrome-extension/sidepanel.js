import { localizeDocument, t } from './i18n.js';

const CHAT_URL = 'https://codex.onepiper.cloud/web/';
const LOAD_HINT_DELAY_MS = 15000;
localizeDocument();
const chat = document.querySelector('#chat');
const settings = document.querySelector('#settings');
const toggle = document.querySelector('#settings-toggle');
const loading = document.querySelector('#loading');
let loadingTimer;
let chatLoading = false;

function loadChat() {
  clearTimeout(loadingTimer);
  chatLoading = true;
  loading.textContent = t('chatOpening');
  loading.hidden = !settings.hidden;
  chat.src = CHAT_URL;
  loadingTimer = setTimeout(() => {
    loading.textContent = t('chatLoadingSlow');
  }, LOAD_HINT_DELAY_MS);
}

chat.addEventListener('load', () => {
  clearTimeout(loadingTimer);
  chatLoading = false;
  loading.hidden = true;
});

toggle.addEventListener('click', () => {
  const showSettings = settings.hidden;
  settings.hidden = !showSettings;
  chat.hidden = showSettings;
  loading.hidden = showSettings || !chatLoading;
  toggle.setAttribute('aria-pressed', String(showSettings));
  const label = showSettings ? t('backToChat') : t('settingsTitle');
  toggle.setAttribute('aria-label', label);
  toggle.title = label;
  // Keep the chat document alive so switching settings preserves the conversation and draft.
  if (showSettings && !settings.hasAttribute('src')) settings.src = 'popup.html';
  else if (showSettings) settings.contentWindow.dispatchEvent(new Event('focus'));
});

document.querySelector('#reload').addEventListener('click', loadChat);
window.addEventListener('pagehide', () => clearTimeout(loadingTimer));
loadChat();
