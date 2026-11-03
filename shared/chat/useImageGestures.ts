import { useCallback, useEffect, useRef, useState, type PointerEvent, type RefObject } from 'react';
import { clampZoom, INITIAL_TRANSFORM, moveImage, type ImageTransform, type Point } from './imageTransform';

const WHEEL_ZOOM_FACTOR = 1.2;
export const IMAGE_ZOOM_FACTOR = 1.5;
const point = (event: PointerEvent) => ({ x: event.clientX, y: event.clientY });
const imageStyle = ({ x, y, rotation, scale }: ImageTransform) =>
  `translate(${x}px, ${y}px) rotate(${rotation}deg) scale(${scale})`;

function useImageWheel(stage: RefObject<HTMLDivElement>, zoom: (factor: number) => void) {
  const latestZoom = useRef(zoom);
  latestZoom.current = zoom;
  useEffect(() => {
    const element = stage.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.deltaY === 0 || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
      latestZoom.current(event.deltaY < 0 ? WHEEL_ZOOM_FACTOR : 1 / WHEEL_ZOOM_FACTOR);
    };
    // React wheel listeners are passive; a native listener keeps zoom out of history scrolling.
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, [stage]);
}

export function useImageGestures() {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const image = useRef<HTMLImageElement | null>(null);
  const transform = useRef(INITIAL_TRANSFORM);
  const pointers = useRef(new Map<number, Point>());
  const anchor = useRef({ before: INITIAL_TRANSFORM, start: [] as Point[] });
  const frame = useRef<number>();
  const displayedScale = useRef(INITIAL_TRANSFORM.scale);
  const [scale, setScale] = useState(INITIAL_TRANSFORM.scale);
  const imageRef = useCallback((element: HTMLImageElement | null) => {
    image.current = element;
    if (element) element.style.transform = imageStyle(transform.current);
  }, []);
  useEffect(() => () => {
    if (frame.current !== undefined) cancelAnimationFrame(frame.current);
    frame.current = undefined;
  }, []);

  const rebase = () => {
    anchor.current = { before: transform.current, start: [...pointers.current.values()] };
  };
  const paint = () => {
    frame.current = undefined;
    if (image.current) image.current.style.transform = imageStyle(transform.current);
    if (displayedScale.current !== transform.current.scale) {
      displayedScale.current = transform.current.scale;
      setScale(transform.current.scale);
    }
  };
  const schedulePaint = () => {
    if (frame.current === undefined) frame.current = requestAnimationFrame(paint);
  };
  const flush = () => {
    if (frame.current !== undefined) cancelAnimationFrame(frame.current);
    paint();
  };
  const update = (next: ImageTransform, defer = false) => {
    transform.current = next;
    rebase();
    if (defer) schedulePaint();
    else flush();
  };
  const move = (event: PointerEvent<HTMLDivElement>) => {
    pointers.current.set(event.pointerId, point(event));
    transform.current = moveImage({ ...anchor.current, current: [...pointers.current.values()] });
  };
  const finish = (event: PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId)) return;
    if (event.type === 'pointerup') move(event);
    pointers.current.delete(event.pointerId);
    flush();
    rebase();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };
  const zoom = (factor: number, defer = false) => {
    const nextScale = clampZoom(transform.current.scale * factor);
    if (nextScale !== transform.current.scale) update({ ...transform.current, scale: nextScale }, defer);
  };
  const reset = () => update(INITIAL_TRANSFORM);
  const rotate = () => update({ ...transform.current, rotation: (transform.current.rotation + 90) % 360 });
  useImageWheel(stageRef, factor => zoom(factor, true));

  return { stageRef, imageRef, scale, zoom, reset, rotate, stageProps: {
    onPointerDown: (event: PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      // Native selection/dragging can cancel pointer capture in Chromium and WebView2.
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      pointers.current.set(event.pointerId, point(event));
      rebase();
    },
    onPointerMove: (event: PointerEvent<HTMLDivElement>) => {
      if (!pointers.current.has(event.pointerId)) return;
      move(event);
      // Keep panning off React's render path and paint only the latest position each frame.
      schedulePaint();
    },
    onPointerUp: finish,
    onPointerCancel: finish,
    onLostPointerCapture: finish,
    onDoubleClick: reset,
  } };
}
