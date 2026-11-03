import { bundleRevision } from './bundle-version.js';

const UNPACKED_ID = 'hgdkdomojacbaehnmlahndjmhglbjjim';
export const UPDATE_ALARM = 'check-bundled-update';

export function createBundleUpdater({ busy, beforeReload }) {
  let checking = false;
  let reloading = false;

  async function check() {
    // Store installations are updated by Chrome and must never use the desktop's unpacked bundle.
    if (chrome.runtime.id !== UNPACKED_ID || checking || reloading || busy()) return;
    checking = true;
    try {
      const response = await fetch(chrome.runtime.getURL('bundle-ready.json'), { cache: 'no-store' });
      if (!response.ok) return;
      const { revision } = await response.json();
      if (typeof revision !== 'string' || !/^[a-f0-9]{64}$/.test(revision)
        || revision === bundleRevision || busy()) return;
      // An open chat may contain an unsent draft or an active response, even with no browser operation.
      const panels = await chrome.runtime.getContexts({ contextTypes: ['SIDE_PANEL'] });
      if (panels.length || busy()) return;
      reloading = true;
      await beforeReload();
      chrome.runtime.reload();
    } catch {
      // An export in progress can temporarily remove the marker; retry at the next alarm.
      reloading = false;
    } finally {
      checking = false;
    }
  }

  function start() {
    if (chrome.runtime.id !== UNPACKED_ID) return;
    chrome.alarms.create(UPDATE_ALARM, { delayInMinutes: 0.5, periodInMinutes: 1 });
    void check();
  }

  return { check, start, isReloading: () => reloading };
}
