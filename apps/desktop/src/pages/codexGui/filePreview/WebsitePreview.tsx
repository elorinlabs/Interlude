import { uiText } from "../../../i18n/uiText";
import { ExternalLink, RotateCw } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { message } from "antd";
import { CopyButton } from "../CopyButton";
import { useWebsitePreview } from "./useWebsitePreview";
import { PreviewNavigation, type PreviewNavigationState } from "./PreviewNavigation";
import styles from "./preview.module.less";

export function WebsitePreview(props: {
  url: string; active: boolean; resizing: boolean; navigation: PreviewNavigationState;
}) {
  const preview = useWebsitePreview(props);
  const openBrowser = () => {
    if (!preview.desktop) { window.open(props.url, "_blank", "noopener,noreferrer"); return; }
    void openUrl(props.url).catch(() => { void message.error({ content: uiText("client.conversation.couldNotOpenTheLinkPleaseTryAgainShortly"),
      style: { maxWidth: 400, marginInline: "auto" } }); });
  };
  return <section className={styles.window} aria-label={uiText("client.workspaceActions.webPreview")}>
    <header className={styles.toolbar}>
      <PreviewNavigation navigation={props.navigation} />
      <div className={styles.heading}><strong>{uiText("client.workspaceActions.webPreview")}</strong><span>{props.url}</span></div>
      <CopyButton text={props.url} label={uiText("client.mobile.copyLink")} />
      <button type="button" className={styles.menu} aria-label={uiText("client.workspaceActions.reloadWebPage")} onClick={preview.retry}>
        <RotateCw size={16} /></button>
      <button type="button" className={styles.menu} aria-label={uiText("client.workspaceActions.openInBrowser")} onClick={openBrowser}>
        <ExternalLink size={16} /></button>
    </header>
    <div className={styles.website} ref={preview.host}>
      {preview.failed && <div className={styles.feedback} role="status">
        {uiText("client.workspaceActions.thisPageCannotBeDisplayedRightNowRetryOrOpen")}<button type="button" onClick={preview.retry}>{uiText("client.terminal.retry")}</button>
      </div>}
      {!preview.desktop && !preview.failed && <iframe key={preview.attempt} title={uiText("client.workspaceActions.webPreview")} src={props.url}
        sandbox="allow-scripts allow-forms" referrerPolicy="no-referrer" onError={preview.fail} />}
    </div>
  </section>;
}
