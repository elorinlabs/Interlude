import { useContext, type ReactElement } from 'react';
import { FileEnvironmentContext } from './fileEnvironment';
import { Dropdown, message } from 'antd';
import { isTauri } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import { uiText } from "../../i18n/uiText";
import { copyText } from '../../utils/clipboard';

function reportLinkError() {
  void message.error({ content: uiText("client.conversation.couldNotOpenTheLinkPleaseTryAgainShortly"),
    style: { maxWidth: 400, marginInline: 'auto' } });
}

export async function openWebsiteInBrowser(url: string, resolve?: (url: string) => Promise<string>) {
  try {
    if (resolve) url = await resolve(url);
    if (isTauri()) await openUrl(url);
    else window.open(url, '_blank', 'noopener,noreferrer');
  } catch { reportLinkError(); }
}

export function WebsiteLinkMenu({ href, children }: { href: string; children: ReactElement }) {
  const environment = useContext(FileEnvironmentContext);
  // WebView's built-in new-window action bypasses React clicks and does not open the system browser.
  // Browser pages retain their own context menu and popup handling.
  if (!isTauri()) return children;
  const copy = async () => {
    try { await copyText(href); }
    catch { void message.error({ content: uiText("client.chat.couldNotCopyTryAgain"),
      style: { maxWidth: 400, marginInline: 'auto' } }); }
  };
  return <Dropdown trigger={['contextMenu']} overlayStyle={{ maxWidth: 400 }} menu={{ items: [
    { key: 'open', label: uiText("client.workspaceActions.openInBrowser"),
      onClick: () => { void openWebsiteInBrowser(href, environment?.resolveWebsite); } },
    { key: 'copy', label: uiText("client.mobile.copyLink"), onClick: () => { void copy(); } },
  ] }}>{children}</Dropdown>;
}
