import { formatDate } from '@interlude/i18n';
import { getInterfaceLanguage } from '../localization/interfaceLanguage';
import { displayText } from '../localization/messages';

const SECOND_MS = 1000;
const MINUTE_SECONDS = 60;
const HOUR_SECONDS = 60 * MINUTE_SECONDS;

interface DownloadTiming {
  createdAt: number;
  completedAt?: number;
}

function formatDuration(milliseconds: number, text: typeof displayText) {
  if (milliseconds < SECOND_MS) return text('client.downloads.durationLessThanSecond');
  const totalSeconds = Math.floor(milliseconds / SECOND_MS);
  const seconds = totalSeconds % MINUTE_SECONDS;
  const minutes = Math.floor(totalSeconds / MINUTE_SECONDS) % MINUTE_SECONDS;
  if (totalSeconds >= HOUR_SECONDS) {
    return text('client.downloads.durationHours', {
      hours: Math.floor(totalSeconds / HOUR_SECONDS), minutes, seconds,
    });
  }
  if (totalSeconds >= MINUTE_SECONDS) {
    return text('client.downloads.durationMinutes', { minutes, seconds });
  }
  return text('client.downloads.durationSeconds', { seconds });
}

/** Elapsed time includes queueing, preparation, pauses and retries, ending after download verification. */
export function downloadCompletionDetails(task: DownloadTiming, text = displayText) {
  const completedAt = task.completedAt;
  const validCompletion = completedAt !== undefined && Number.isFinite(completedAt)
    && !Number.isNaN(new Date(completedAt).getTime());
  if (!validCompletion) return { completedAt: '', duration: '', summary: '' };
  const time = formatDate(getInterfaceLanguage(), completedAt, {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  });
  const elapsed = completedAt - task.createdAt;
  const duration = Number.isFinite(elapsed) && elapsed >= 0 ? formatDuration(elapsed, text) : '';
  return {
    completedAt: text('client.downloads.completedAt', { time }),
    duration: duration ? text('client.downloads.totalDuration', { duration }) : '',
    summary: duration ? text('client.downloads.completionSummary', { time, duration }) : time,
  };
}
