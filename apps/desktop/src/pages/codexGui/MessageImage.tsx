import { uiText } from "../../i18n/uiText";
import { useContext, useState } from "react";
import { FileEnvironmentContext } from './fileEnvironment';
import { ImagePreview } from "./ImagePreview";
import styles from "./MessageImage.module.less";
import thumbnailStyles from "../../../../../shared/chat/toolImageThumbnail.module.css";
import { useImageSource } from "./useImageSource";
import { isTauri } from "@tauri-apps/api/core";
import { isHostedWebApp } from "../../api/backend";
import { FileMenu } from "./FileMenu";
import { parseFileReference } from "./fileReference";

interface MessageImageProps { src?: string; alt?: string; title?: string; compact?: boolean }

export function MessageImage(props: MessageImageProps) {
  const environment = useContext(FileEnvironmentContext);
  return environment ? environment.image(props) : <LocalMessageImage {...props} />;
}

function LocalMessageImage({ src, alt, title, compact }: MessageImageProps) {
  const [failedSource, setFailedSource] = useState<string>();
  const [preview, setPreview] = useState(false);
  const image = useImageSource(src);
  const description = alt?.trim() || uiText("client.chat.image");
  const file = src && (isTauri() || isHostedWebApp) ? parseFileReference(src) : undefined;
  if (image.loading) return <span className={styles.unavailable} role="status">{uiText("client.mobile.loading.f020e4")}{description}…</span>;
  if (file && (!image.url || image.failed || failedSource === image.url)) {
    return <FileMenu {...file} preview>{description}</FileMenu>;
  }
  if (image.failed || (image.url && failedSource === image.url)) return <span className={styles.unavailable} role="status">
    <span>{description}{uiText("client.chat.couldNotLoadImage")}</span>
    <button type="button" onClick={() => { setFailedSource(undefined); image.retry(); }}>{uiText("client.terminal.retry")}</button>
  </span>;
  if (!image.url) return <span className={styles.unavailable}>{description}{uiText("client.conversation.previewUnavailable")}</span>;

  return <>
    <button type="button" className={`${styles.thumbnail}${compact ? ` ${thumbnailStyles.thumbnail}` : ""}`}
      aria-label={uiText("client.chat.enlarge", { value1: description })}
      title={title} onClick={() => setPreview(true)}>
      <img src={image.url} alt={description} loading="lazy" decoding="async" referrerPolicy="no-referrer"
        onError={() => setFailedSource(image.url)} />
    </button>
    {preview && <ImagePreview key={src} thumbnail={image.url} description={description}
      load={image.original} close={() => setPreview(false)} />}
  </>;
}
