import { displayText } from '../../i18n/index';
import { useState } from 'react';
import { t, useLanguage } from '../../i18n';
import { checkStatus, type CheckKind } from '../../../../../shared/remote-chat/taskReview';
import type { TaskReviewModel } from '../../../../../shared/remote-chat/useTaskReview';

const LABELS = { notRun: "client.taskReview.notRun", running: "client.taskReview.running", passed: "client.taskReview.passed", failed: "client.taskReview.failed",
  stale: "client.taskReview.resultIsOutOfDate", interrupted: "client.taskReview.checkInterrupted" };

export function TaskReviewChecks({ model }: { model: TaskReviewModel }) {
  useLanguage();
  const [confirm, setConfirm] = useState<CheckKind | null>(null);
  const snapshot = model.snapshot;
  if (!snapshot) return null;
  const command = snapshot.commands.find(row => row.kind === confirm);
  return <section className="chat-review-section">
    <h3>{t("client.taskReview.projectChecks")}</h3>
    <p className="chat-muted chat-review-notice">{t("client.taskReview.checksRunAgainstTheCurrentProjectClaimsInChatDo")}</p>
    <p className="chat-muted">{t("client.taskReview.codeVersion")}：<code>{snapshot.revision.head?.slice(0, 8) || t("client.taskReview.noCommitYet")}
      {' / '}{snapshot.revision.id.slice(0, 10)}</code></p>
    {(['build', 'lint', 'test'] as const).map(kind => {
      const plan = snapshot.commands.find(row => row.kind === kind);
      const record = snapshot.checks.find(row => row.kind === kind);
      const status = checkStatus(record, snapshot.revision);
      return <div className="chat-review-check" key={kind}>
        <div className="chat-review-check-header"><strong>{kind}</strong>
          <span data-check-status={status}>{displayText(LABELS[status])}</span>
          {plan && <button type="button" className="chat-text-action"
            disabled={!model.enabled || model.busy || model.running} onClick={() => setConfirm(kind)}>
            {t("client.taskReview.runCheck")}</button>}</div>
        <small className="chat-muted">{plan?.command || t("client.taskReview.thisCheckIsNotConfiguredForTheProject")}</small>
        {record && <details><summary>{t("client.taskReview.viewCheckRecord")}</summary>
          <p className="chat-muted">{t("client.taskReview.codeVersion")}：{record.revision.slice(0, 10)} · {record.command}
            {' · '}{new Date(record.startedAt).toLocaleString()}
            {record.exitCode != null && ` · exit ${record.exitCode}`}</p>
          <pre className="chat-review-output">{record.output || t("client.taskReview.waitingForTheCheckToFinish")}</pre></details>}
      </div>;
    })}
    {command && <div className="chat-review-confirm" role="group" aria-label={t("client.taskReview.confirmCheck")}>
      <p>{t("client.taskReview.thisRunsAProjectCommandOnYourComputerAndMay")}</p><code>{command.command}</code>
      <div className="chat-review-actions"><button type="button" className="chat-button"
        disabled={!model.enabled || model.busy || model.running}
        onClick={() => { setConfirm(null); void model.run(command.kind); }}>{t("client.taskReview.confirmCheck")}</button>
        <button type="button" className="chat-text-action" onClick={() => setConfirm(null)}>{t("client.accounts.cancel")}</button></div>
    </div>}
  </section>;
}
