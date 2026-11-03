import { useEffect, useRef } from 'react';
import type { RemoteFilePreviewProps } from '../../../desktop/src/pages/codexGui/DetailsWorkspace';
import { PreviewNavigation } from '../../../desktop/src/pages/codexGui/filePreview/PreviewNavigation';
import styles from '../../../desktop/src/pages/codexGui/filePreview/preview.module.less';
import { ChatFilePreviewContent, type FilePreviewContext } from './ChatFilePreview';
import { t, useLanguage } from '../i18n';
import './remoteFilePreview.css';

/** Keep remote reads and downloads bound to the connected computer inside the shared drawer. */
export function ChatRemoteFilePreview({ target, active, navigation, context }: RemoteFilePreviewProps & {
  context: FilePreviewContext;
}) {
  useLanguage();
  const host = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!active) host.current?.querySelectorAll('video, audio').forEach(element => {
      (element as HTMLMediaElement).pause();
    });
  }, [active]);
  return <section ref={host} className={styles.window} aria-label={t("client.projectBrowser.filePreview")}>
    <header className={styles.toolbar}>
      <PreviewNavigation navigation={navigation} />
      <div className={styles.heading}>
        <strong>{target.path.split(/[\\/]/).at(-1) || t("client.projectBrowser.filePreview")}</strong><span>{target.path}</span>
      </div>
    </header>
    <div className="chat-remote-file-preview">
      <ChatFilePreviewContent path={target.path} line={target.line}
        context={{ ...context, threadId: target.threadId }} />
    </div>
  </section>;
}
