const THOUSAND = 1_000;
const MILLION = 1_000_000;
const DECIMALS = 2;

function validAmount(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

export function formatCompactTokens(value: number | null | undefined) {
  if (!validAmount(value)) return '—';
  if (value >= MILLION) return `${(value / MILLION).toFixed(DECIMALS)} M`;
  if (value >= THOUSAND) return `${(value / THOUSAND).toFixed(DECIMALS)} K`;
  return value.toFixed(DECIMALS);
}

export function formatUsageUsd(value: number | null | undefined) {
  return `${validAmount(value) ? value.toFixed(DECIMALS) : '—'} USD`;
}
