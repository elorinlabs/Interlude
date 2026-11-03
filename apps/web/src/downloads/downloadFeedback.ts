import './downloadFeedback.css';

export interface DownloadOrigin { x: number; y: number }
const FLIGHT_SIZE = 32;
const FLIGHT_DURATION_MS = 650;
const ARRIVAL_DURATION_MS = 240;
const ARC_HEIGHT = 80;

/** Capture before awaiting the download, while the clicked menu item still exists. */
export function downloadOrigin(event: {
  currentTarget: EventTarget | null; clientX?: number; clientY?: number; detail?: number;
}): DownloadOrigin | undefined {
  if (event.detail && event.clientX !== undefined && event.clientY !== undefined) {
    return { x: event.clientX, y: event.clientY };
  }
  const bounds = event.currentTarget instanceof Element ? event.currentTarget.getBoundingClientRect() : undefined;
  return bounds ? { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 } : undefined;
}

/** Successful download actions fly toward the visible navigation icon, without intercepting input. */
export function animateDownloadToNavigation(origin?: DownloadOrigin) {
  if (!origin || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const target = [...document.querySelectorAll<HTMLElement>('[data-download-target]')].find(element => {
    const bounds = element.getBoundingClientRect();
    return bounds.width > 0 && bounds.height > 0 && bounds.bottom > 0 && bounds.right > 0
      && bounds.top < innerHeight && bounds.left < innerWidth;
  });
  const artwork = target?.querySelector('svg');
  if (!target || !artwork || typeof target.animate !== 'function') return;
  const bounds = target.getBoundingClientRect();
  const destination = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  const flight = document.createElement('div');
  flight.className = 'download-flight';
  flight.setAttribute('aria-hidden', 'true');
  flight.append(artwork.cloneNode(true));
  document.body.append(flight);
  const transform = (point: DownloadOrigin, scale: number) =>
    `translate(${point.x - FLIGHT_SIZE / 2}px, ${point.y - FLIGHT_SIZE / 2}px) scale(${scale})`;
  const animation = flight.animate([
    { transform: transform(origin, 1), opacity: 1 },
    { transform: transform({ x: (origin.x + destination.x) / 2,
      y: Math.max(FLIGHT_SIZE / 2, Math.min(origin.y, destination.y) - ARC_HEIGHT) }, 0.85),
      opacity: 0.9, offset: 0.55 },
    { transform: transform(destination, 0.3), opacity: 0 },
  ], { duration: FLIGHT_DURATION_MS, easing: 'cubic-bezier(.22,.61,.36,1)' });
  void animation.finished.then(() => {
    flight.remove();
    if (target.isConnected) target.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.2)' },
      { transform: 'scale(1)' }], { duration: ARRIVAL_DURATION_MS });
  }, () => flight.remove());
}
