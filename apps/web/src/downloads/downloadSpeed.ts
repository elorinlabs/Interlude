import { DownloadSpeed } from '../../../../shared/downloads/downloadSpeed';
import type { DownloadTask } from './types';

const REFRESH_MS = 250;

/** One monitor per transfer attempt, shared by legacy and bulk downloads. */
export function monitorDownloadSpeed(update: (task: DownloadTask) => void) {
  let current: DownloadTask | undefined;
  let speed: DownloadSpeed | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  const stop = () => {
    clearInterval(timer);
    timer = undefined;
    speed = undefined;
    current = undefined;
  };
  const publish = () => {
    if (!current || !speed) return;
    current = { ...current, bytesPerSecond: speed.sample(current.received, performance.now()) };
    update(current);
  };
  return {
    update(task: DownloadTask) {
      if (task.status !== 'downloading') {
        stop();
        update({ ...task, bytesPerSecond: undefined });
        return;
      }
      if (!speed || (current && task.received < current.received)) {
        stop();
        speed = new DownloadSpeed(task.received, performance.now());
        timer = setInterval(publish, REFRESH_MS);
      }
      current = task;
      publish();
    },
    stop,
  };
}
