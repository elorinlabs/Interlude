import { uiText } from "../../../i18n/uiText";
import { useEffect, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { FileMenu } from "../FileMenu";
import { CopyButton } from "../CopyButton";
import type { FilePreviewData } from "./api";
import { PreviewContent } from "./PreviewContent";
import { PreviewNavigation, type PreviewNavigationState } from "./PreviewNavigation";
import styles from "./preview.module.less";

export function FilePreviewPanel({ data, active, navigation }: {
  data: FilePreviewData; active: boolean; navigation: PreviewNavigationState;
}) {
  const [source, setSource] = useState(Boolean(data.line));
  const host = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!active) host.current?.querySelectorAll("video, audio").forEach(element => {
      (element as HTMLMediaElement).pause();
    });
  }, [active]);
  return <section ref={host} className={styles.window} aria-label={uiText("client.projectBrowser.filePreview")}>
    <header className={styles.toolbar}>
      <PreviewNavigation navigation={navigation} />
      <div className={styles.heading}><strong>{data.name}</strong><span>{data.path}</span></div>
      {(data.kind === "html" || data.kind === "markdown") && <div role="group" aria-label={uiText("client.chat.displayMode")}
        className={styles.modes}>
        <button type="button" aria-pressed={!source} onClick={() => setSource(false)}>{uiText("client.chat.preview")}</button>
        <button type="button" aria-pressed={source} onClick={() => setSource(true)}>{uiText("client.downloads.source")}</button>
      </div>}
      {data.text !== null && <CopyButton text={data.text} label={uiText("client.chat.copyFileContents")} />}
      <FileMenu path={data.path} line={data.line} column={data.column} className={styles.menu}>
        <MoreHorizontal size={18} aria-hidden="true" /><span>{uiText("client.workspaceActions.fileMenu")}</span>
      </FileMenu>
    </header>
    <PreviewContent data={data} source={source} />
  </section>;
}
