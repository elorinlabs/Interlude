import { t } from './i18n.js';

export const ALL_WEBSITES = { origins: ['http://*/*', 'https://*/*'] };

export async function siteAccessMode() {
  const { siteAccessMode: mode = 'all' } = await chrome.storage.local.get('siteAccessMode');
  return mode === 'ask' ? 'ask' : 'all';
}

export async function allSitesAllowed() {
  return await siteAccessMode() === 'all' && await chrome.permissions.contains(ALL_WEBSITES);
}

export async function assertWebsitePermission(origin) {
  if (!await chrome.permissions.contains({ origins: [`${origin}/*`] })) {
    throw new Error(t('allowSiteInChrome'));
  }
}
