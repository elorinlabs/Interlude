import type { TimelineEntry } from './activityTimeline';

/** Keep parts of one response together without merging user messages or turn summaries. */
export function hasCompactTimelineGap(previous?: TimelineEntry, next?: TimelineEntry): boolean {
  if (!previous || !next || previous.turn.id !== next.turn.id) return false;
  return ![previous, next].some(entry => entry.kind === 'summary'
    || (entry.kind === 'message' && entry.item.type === 'userMessage'));
}
