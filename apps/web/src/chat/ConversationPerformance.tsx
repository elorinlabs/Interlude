import { Tooltip } from 'antd';
import { useEffect, useState } from 'react';
import { CONVERSATION_TSR_DESCRIPTION, formatConversationTsr } from '../../../../shared/remote-chat/commandMetrics';
import { t, useLanguage } from '../i18n';
import { useConversationMetrics } from '../../../../shared/remote-chat/client/useConversationMetrics';
import { CONVERSATION_TPS_DESCRIPTION, CONVERSATION_TTFT_DESCRIPTION, formatConversationTps, formatConversationTtft,
  type ConversationMetrics, type ReadConversationMetrics } from '../../../../shared/remote-chat/conversationMetrics';

export function ConversationPerformance({ read, threadId, active }: {
  read: ReadConversationMetrics; threadId: string | null; active: boolean;
}) {
  const [visible, setVisible] = useState(() => document.visibilityState !== 'hidden');
  useEffect(() => {
    const update = () => setVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);
  const metrics = useConversationMetrics(read, threadId, active && visible);
  return <ConversationPerformanceValues metrics={metrics} />;
}

export function ConversationPerformanceValues({ metrics }: { metrics: ConversationMetrics | null }) {
  useLanguage();
  const success = `${formatConversationTsr(metrics)} TSR`;
  const speed = `${formatConversationTps(metrics)} TPS`;
  const firstToken = `${formatConversationTtft(metrics)} TTFT`;
  return <>
    <Tooltip title={t(CONVERSATION_TSR_DESCRIPTION)}
      styles={{ root: { maxWidth: 'min(400px, calc(100vw - 16px))' } }}>
      <span className="chat-conversation-tsr"
        aria-label={t('client.chat.commandSuccessRateValue', { value: success })}>{success}</span>
    </Tooltip>
    {' · '}
    <Tooltip title={t(CONVERSATION_TPS_DESCRIPTION)} styles={{ root: { maxWidth: 400 } }}>
      <span className="chat-conversation-tps" aria-label={`${t("client.mobile.conversationOutputSpeed")} ${speed}`}>{speed}</span>
    </Tooltip>
    {' · '}
    <Tooltip title={t(CONVERSATION_TTFT_DESCRIPTION)} styles={{ root: { maxWidth: 400 } }}>
      <span className="chat-conversation-ttft" aria-label={`${t("client.mobile.timeToFirstToken")} ${firstToken}`}>{firstToken}</span>
    </Tooltip>
  </>;
}
