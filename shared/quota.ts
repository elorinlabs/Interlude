// Match the PC account meter without changing its display or behavior.
const LOW_QUOTA_PERCENT = 15;
const WARNING_QUOTA_PERCENT = 35;

export function remainingTone(value: number) {
  if (value <= LOW_QUOTA_PERCENT) return 'danger';
  if (value <= WARNING_QUOTA_PERCENT) return 'warning';
  return 'good';
}

export function remainingStroke(value: number, accent = '#35ada7') {
  const tone = remainingTone(value);
  if (tone === 'danger') return '#d2685b';
  if (tone === 'warning') return '#d0a340';
  return accent;
}
