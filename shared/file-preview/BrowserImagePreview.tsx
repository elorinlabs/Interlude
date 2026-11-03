import { useImageGestures, IMAGE_ZOOM_FACTOR } from '../chat/useImageGestures';
import { displayText as t } from '../localization/messages';
import './browserImagePreview.css';

export function BrowserImagePreview({ src, name }: { src: string; name: string }) {
  const gestures = useImageGestures();
  return <div className="browser-image-preview">
    <div className="browser-image-stage" ref={gestures.stageRef} {...gestures.stageProps}>
      <img src={src} alt={name} draggable={false} referrerPolicy="no-referrer" ref={gestures.imageRef}
        onDragStart={event => event.preventDefault()} />
    </div>
    <div className="browser-image-toolbar" onPointerDown={event => event.stopPropagation()}>
      <button type="button" aria-label={t('client.shared.zoomOut')}
        onClick={() => gestures.zoom(1 / IMAGE_ZOOM_FACTOR)}>−</button>
      <button type="button" aria-label={t('client.shared.resetZoom')} onClick={gestures.reset}>
        {Math.round(gestures.scale * 100)}%
      </button>
      <button type="button" aria-label={t('client.shared.zoomIn')}
        onClick={() => gestures.zoom(IMAGE_ZOOM_FACTOR)}>+</button>
    </div>
  </div>;
}
