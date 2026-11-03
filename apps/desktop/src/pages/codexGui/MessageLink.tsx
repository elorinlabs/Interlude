import { uiText } from "../../i18n/uiText";
import { useContext, type ReactNode } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { FileMenu } from "./FileMenu";
import { parseFileReference } from "./fileReference";
import { WebsiteIcon } from "./WebsiteIcon";
import { MessageImage } from "./MessageImage";
import { localImageSource } from "./imageSources";
import { DetailsContext } from "./detailsContext";
import { WebsiteLinkMenu, openWebsiteInBrowser } from "./WebsiteLinkMenu";
import { FileEnvironmentContext } from './fileEnvironment';
import { remoteDevelopmentUrl } from '../../../../../shared/terminal/links';

export { isFileReference } from "./fileReference";

function isWebsiteUrl(href: string | undefined): href is string {
  if (!href || !/^https?:\/\//i.test(href)) return false;
  try { return Boolean(new URL(href).hostname); } catch { return false; }
}

export function MessageLink({ href, children }: { href?: string; children?: ReactNode }) {
  const panel = useContext(DetailsContext);
  const environment = useContext(FileEnvironmentContext);
  const openBrowser = () => openWebsiteInBrowser(href ?? '', environment?.resolveWebsite);
  if (href && localImageSource(href)) return <MessageImage src={href}
    alt={typeof children === "string" ? children : uiText("client.chat.image")} />;
  const file = href ? parseFileReference(href) : undefined;
  if (file) return <FileMenu {...file} preview>{children}</FileMenu>;
  if (!isWebsiteUrl(href)) return <span>{children}</span>;
  return <WebsiteLinkMenu href={href}><a href={href} target="_blank" rel="noopener noreferrer"
    onAuxClick={(event) => {
      if ((!isTauri() && !environment) || event.button !== 1) return;
      event.preventDefault(); void openBrowser();
    }} onClick={(event) => {
    if (panel && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
      event.preventDefault(); panel.openWebsite(href); return;
    }
    // Explicit browser shortcuts and contexts without a details sidebar retain their original behavior.
    if (!isTauri() && !environment) return;
    event.preventDefault();
    void openBrowser();
  }}>{!(environment && remoteDevelopmentUrl(href)) && <WebsiteIcon key={href} href={href} />}
    {children}</a></WebsiteLinkMenu>;
}
