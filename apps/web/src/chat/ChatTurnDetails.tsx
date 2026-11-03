import { t, useLanguage } from '../i18n';
import { CheckCircle2, Circle, LoaderCircle } from 'lucide-react';
import type { Turn } from './types';
import { AdaptiveSheet } from '../components/AdaptiveSheet';
import { completedTurnFiles } from '../../../../shared/chat/turnPresentation';
import { requestErrorDetails } from '../../../desktop/src/pages/codexGui/requestError';
import { turnErrorNotice, type TurnPanel } from './ChatTurnSummary';
import { ChatMarkdown } from './ChatMarkdown';
import { ChatDiff } from './ChatDiff';
import { ChatCodeBlock } from './ChatCodeBlock';
import { TaskReviewPanel } from './review/TaskReviewPanel';

const TITLES = { get plan() { return t("client.chat.taskPlan"); }, get changes() { return t("client.chat.changesThisTurn"); },
  get error() { return t("client.chat.errorDetails"); }, get result() { return t("client.taskReview.taskReview"); } };
export function ChatTurnDetails({ turn, panel, onClose, tabId }: {
  turn: Turn; panel: TurnPanel; onClose: () => void; tabId?: string;
}) {
  useLanguage();
  const error = turn.error ?? turn.retryError;
  return <AdaptiveSheet open tabId={tabId} title={TITLES[panel]} width={760} onClose={onClose}
    presentation={panel === 'changes' || panel === 'result' ? 'drawer' : 'adaptive'}>
    <div className="chat-detail-stack">
      {panel === 'result' && <TaskReviewPanel key={turn.id} turn={turn} />}
      {panel === 'changes' && <ChatDiff files={completedTurnFiles(turn)} />}
      {panel === 'error' && <ChatCodeBlock label={t("client.chat.errorDetails")} copyLabel={t("client.chat.copyErrorDetails")}
        text={error ? requestErrorDetails(error) : turnErrorNotice(turn)} wrapMode="always" />}
      {panel === 'plan' && <>
        {turn.planExplanation && <ChatMarkdown text={turn.planExplanation} />}
        {turn.plan?.map((step, index) => {
          const Icon = step.status === 'completed' ? CheckCircle2 : step.status === 'inProgress' ? LoaderCircle : Circle;
          const label = { completed: t("client.chat.completed"), inProgress: t("client.chat.inProgress"), pending: t("client.chat.pending") }[step.status] || t("client.chat.pending");
          return <div className="chat-plan-step" key={index}><Icon size={17} />
            <span>{step.step}</span><small>{label}</small></div>;
        })}
      </>}
    </div>
  </AdaptiveSheet>;
}
