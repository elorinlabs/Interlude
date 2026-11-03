import { uiText } from "../../../i18n/uiText";
import { useState } from "react";
import type { FilePreviewData } from "./api";
import { PreviewCode } from "./PreviewCode";
import { JsonPreview } from '../../../../../../shared/file-preview/JsonPreview';
import { isJsonPath } from '../../../../../../shared/file-preview/jsonHighlightLimit';
import { PreviewMarkdown } from "./PreviewMarkdown";
import styles from "./preview.module.less";

function MediaPreview({ data }: { data: FilePreviewData }) {
  const [failed, setFailed] = useState(false);
  const [originalSize, setOriginalSize] = useState(false);
  if (failed) return <p className={styles.feedback} role="status">
    {uiText("client.workspaceActions.thisFileCannotBePreviewedRightNowUseTheFile")}</p>;
  const onError = () => setFailed(true);
  if (data.kind === "pdf") return <object className={styles.frame} data={data.url} type="application/pdf">
    <p className={styles.feedback}>{uiText("client.workspaceActions.thisPdfCannotBePreviewedRightNowOpenItUsing")}</p>
  </object>;
  if (data.kind === "image") return <div className={styles.imageArea}>
    <button type="button" className={styles.imageToggle} onClick={() => setOriginalSize(!originalSize)}>
      {originalSize ? uiText("client.workspaceActions.fitToWindow") : uiText("client.workspaceActions.originalSize")}
    </button>
    <div className={originalSize ? styles.originalImage : styles.fittedImage}>
      <img src={data.url} alt={data.name} onError={onError} />
    </div>
  </div>;
  return <div className={styles.media}>
    {data.kind === "video" ? <video aria-label={data.name} controls playsInline preload="metadata"
      src={data.url} onError={onError} />
      : <audio aria-label={data.name} controls preload="metadata" src={data.url} onError={onError} />}
  </div>;
}

export function PreviewContent({ data, source }: { data: FilePreviewData; source: boolean }) {
  if (data.text !== null && (source || data.kind === "text")) {
    if (isJsonPath(data.path)) return <JsonPreview text={data.text} size={data.size} line={data.line} />;
    return <PreviewCode text={data.text} path={data.path} line={data.line} />;
  }
  if (data.kind === "html") return <iframe title={uiText("client.downloads.htmlPreview")} className={styles.frame}
    src={data.url} sandbox="allow-scripts" referrerPolicy="no-referrer" />;
  if (data.kind === "markdown") return <PreviewMarkdown text={data.text ?? ""} path={data.path} url={data.url} />;
  return <MediaPreview key={data.url} data={data} />;
}
