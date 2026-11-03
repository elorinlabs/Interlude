import { Tooltip } from 'antd';
import type { MessageTranslator } from '../localization/messages';
import type { UsageSummary } from '../remote-chat/usage';
import './quotaEstimate.css';

const QUOTA_DECIMALS = 2;

function formatAmount(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value.toFixed(QUOTA_DECIMALS) : '—';
}

export function QuotaEstimate({ usage, translate }: {
  usage: UsageSummary | null; translate: MessageTranslator;
}) {
  if (usage?.primaryRemainingPercent == null || !Number.isFinite(usage.primaryRemainingPercent)) return null;
  const remaining = formatAmount(usage.estimatedQuota?.remainingUsd);
  const total = formatAmount(usage.estimatedQuota?.capacityUsd);
  const description = translate('client.chatQuota.ratioDescription', { remaining, total });
  return <Tooltip title={description} trigger={['hover', 'focus']}
    styles={{ root: { maxWidth: 'min(400px, calc(100vw - 16px))' }, body: { overflowWrap: 'anywhere' } }}>
    <span className="cs-quota-estimate" tabIndex={0} aria-label={description}>{remaining}/{total}USD</span>
  </Tooltip>;
}
