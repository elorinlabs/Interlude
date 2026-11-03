import { displayError } from '../../i18n/index';
import { t, useLanguage } from '../../i18n';
import type { Turn } from '../types';
import { useTaskReview } from '../../../../../shared/remote-chat/useTaskReview';
import { completedTurnFiles } from '../../../../../shared/chat/turnPresentation';
import { AdaptiveSheet } from '../../components/AdaptiveSheet';
import { ChatDiff } from '../ChatDiff';
import { TaskReviewChecks } from './TaskReviewChecks';
import { TaskReviewDelivery, TaskReviewRestore } from './TaskReviewDelivery';
import './review.css';

export function TaskReviewPanel({ turn }: { turn: Turn }) {
  useLanguage();
  const model = useTaskReview(turn);
  const comment = model.comment;
  return <div className="chat-review-panel">
    {!model.enabled && <p className="chat-review-notice">{t("client.taskReview.connectToYourComputerToRunChecksSendFeedbackOr")}</p>}
    {model.error && <p role="alert" className="chat-error chat-review-notice">{displayError(model.error)}</p>}
    <button type="button" className="chat-text-action" disabled={model.loading || !model.enabled}
      onClick={() => { void model.refresh(); }}>{model.loading ? t("client.projectBrowser.loading") : t("client.taskReview.refreshReview")}</button>
    <TaskReviewChecks model={model} />
    <section className="chat-review-section"><h3>{t("client.taskReview.thisTurnSChanges")}</h3>
      <p className="chat-muted chat-review-notice">{t("client.taskReview.leaveFeedbackBesideAChangedLineToContinueFixingIt")}</p>
      {model.sent && <p role="status">{t("client.taskReview.feedbackSentToTheOriginalConversation")}</p>}
      <ChatDiff files={completedTurnFiles(turn)} onComment={model.selectLine} />
    </section>
    <TaskReviewRestore model={model} />
    <TaskReviewDelivery model={model} turn={turn} />
    {comment && <AdaptiveSheet open title={t("client.taskReview.reviewFeedback")} width={400} onClose={model.closeComment}>
      <div className="chat-review-form">
        <p className="chat-review-path">{comment.file.path} · {t(comment.line.kind === 'remove' ? "client.chat.before" : "client.chat.after")}
          {' '}{comment.line.kind === 'remove' ? comment.line.oldLine : comment.line.newLine}</p>
        <pre className="chat-review-output">{comment.line.text}</pre>
        <textarea aria-label={t("client.taskReview.reviewFeedback")} placeholder={t("client.taskReview.howShouldThisLineChange")} value={model.feedback} rows={4}
          maxLength={8_000} onChange={event => model.setFeedback(event.target.value)} />
        <button type="button" className="chat-button" disabled={!model.enabled || model.busy || !model.feedback.trim()}
          onClick={() => { void model.sendComment(); }}>{t("client.taskReview.sendToOriginalChat")}</button>
        {model.error && <p role="alert" className="chat-error">{displayError(model.error)}</p>}
      </div>
    </AdaptiveSheet>}
  </div>;
}
