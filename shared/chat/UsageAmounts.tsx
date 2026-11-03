import { Tooltip } from 'antd';
import type { MessageTranslator } from '../localization/messages';
import { formatCompactTokens, formatUsageUsd } from '../remote-chat/usageAmounts';
import './usageAmounts.css';

export function UsageAmounts({ tokens, cost, scope, translate }: {
  tokens?: number | null; cost?: number | null; scope: 'current' | 'today'; translate: MessageTranslator;
}) {
  const tokenText = formatCompactTokens(tokens);
  const costText = formatUsageUsd(cost);
  const description = translate(scope === 'current'
    ? 'client.chatQuota.currentUsageDescription' : 'client.chatQuota.dailyUsageDescription', {
    tokens: tokenText, cost: costText,
  });
  return <Tooltip title={description} trigger={['hover', 'focus']}
    styles={{ root: { maxWidth: 'min(400px, calc(100vw - 16px))' }, body: { overflowWrap: 'anywhere' } }}>
    <span className={`cs-usage-amounts cs-usage-${scope}`} tabIndex={0} aria-label={description}>
      <span className="cs-usage-token-value">{tokenText}</span>
      <span aria-hidden="true"> · </span>
      <span className="cs-usage-cost-value">{costText}</span>
    </span>
  </Tooltip>;
}
