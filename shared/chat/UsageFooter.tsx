import { Tooltip } from 'antd';
import type { ReactNode } from 'react';
import type { MessageTranslator } from '../localization/messages';
import { usageTrailing, type UsageSummary } from '../remote-chat/usage';
import { UsageAmounts } from './UsageAmounts';
import './usageFooter.css';

export function UsageFooter({ usage, translate, children }: {
  usage: UsageSummary | null; translate: MessageTranslator; children?: ReactNode;
}) {
  const trailing = usageTrailing(usage, translate);
  return <>
    {children}
    <span className="cs-daily-usage">
      {children && <span aria-hidden="true"> · </span>}
      <UsageAmounts tokens={usage?.totalTokens} cost={usage?.estimatedCostUsd} scope="today" translate={translate} />
      {trailing && !trailing.quota && <>
        <span aria-hidden="true"> · </span>
        <span className="cs-usage-quota">
          <Tooltip title={trailing.description} trigger={['hover', 'focus']} styles={{ root: { maxWidth: 400 } }}>
            <span className="cs-usage-remaining" tabIndex={0}>{trailing.text}</span>
          </Tooltip>
        </span>
      </>}
    </span>
  </>;
}
