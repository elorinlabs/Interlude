import type { MouseEventHandler, ReactNode } from 'react';
import { defaultText } from '../localization/messages';
import { IMAGE_ZOOM_FACTOR, useImageGestures } from './useImageGestures';
import './imageViewer.css';

interface Props {
  src: string;
  description: string;
  close: () => void;
  translate?: (text: string) => string;
  naturalSize?: boolean;
  onError?: () => void;
  onContextMenu?: MouseEventHandler<HTMLDivElement>;
  children?: ReactNode;
}

/** Shared fullscreen preview chrome, independent of image loading, downloads and editing. */
export function ImageViewerFrame({ src, description, close, translate = defaultText, naturalSize = false,
  onError, onContextMenu, children }: Props) {
  const gestures = useImageGestures();
  return <dialog ref={(dialog) => { if (dialog && !dialog.open) dialog.showModal(); }}
    className="cs-image-viewer" aria-label={description} onCancel={close}
    onWheel={event => event.stopPropagation()}>
    <div className={`cs-image-stage${naturalSize ? ' cs-image-stage-natural' : ''}`}
      ref={gestures.stageRef} {...gestures.stageProps} onDragStart={event => event.preventDefault()}
      onContextMenu={onContextMenu}>
      <img src={src} alt={description} draggable={false} referrerPolicy="no-referrer"
        onError={onError} ref={gestures.imageRef} />
    </div>
    <button type="button" className="cs-image-close" aria-label={translate('client.shared.closeImage')}
      onClick={close}>×</button>
    <div className="cs-image-toolbar">
      <button type="button" aria-label={translate('client.shared.zoomOut')}
        onClick={() => gestures.zoom(1 / IMAGE_ZOOM_FACTOR)}>−</button>
      <button type="button" aria-label={translate('client.shared.resetZoom')} onClick={gestures.reset}>
        {Math.round(gestures.scale * 100)}%</button>
      <button type="button" aria-label={translate('client.shared.zoomIn')}
        onClick={() => gestures.zoom(IMAGE_ZOOM_FACTOR)}>+</button>
      <button type="button" aria-label={translate('client.shared.rotateImage')} onClick={gestures.rotate}>↻</button>
    </div>
    {children}
  </dialog>;
}
