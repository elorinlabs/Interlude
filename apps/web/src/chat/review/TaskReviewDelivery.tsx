import { displayError } from '../../i18n/index';
import { useState } from 'react';
import { t, useLanguage } from '../../i18n';
import type { TaskReviewModel } from '../../../../../shared/remote-chat/useTaskReview';
import { resultSummary } from '../../../../../shared/remote-chat/taskReview';
import type { Turn } from '../types';

export function TaskReviewDelivery({ model, turn }: { model: TaskReviewModel; turn: Turn }) {
  useLanguage();
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState(resultSummary(turn).slice(0, 80));
  const [body, setBody] = useState(resultSummary(turn));
  const [base, setBase] = useState('');
  const pr = model.pullRequest;
  const revision = model.snapshot?.revision;
  const current = !!revision && !revision.dirty && pr?.headRefOid === revision.head;
  return <section className="chat-review-section">
    <h3>{t("client.taskReview.prAndCi")}</h3>
    <button type="button" className="chat-text-action" disabled={!model.enabled || model.busy}
      onClick={() => { void model.loadPr(); }}>{t("client.taskReview.refreshPrAndCi")}</button>
    {model.prError && <p role="alert" className="chat-review-notice">{displayError(model.prError)}</p>}
    {pr && <>
      <p>{/^https:\/\//i.test(pr.url)
        ? <a href={pr.url} target="_blank" rel="noreferrer">#{pr.number} {pr.title}</a> : pr.title}</p>
      <p className="chat-muted">{t("client.taskReview.prCommit")}：{pr.headRefOid.slice(0, 10)}</p>
      {!current && <p className="chat-review-notice">{t("client.taskReview.ciRefersToADifferentCodeVersionCommitAndPush")}</p>}
      {!pr.statusCheckRollup?.length && <p className="chat-muted">{t("client.taskReview.noCiResultsYet")}</p>}
      {pr.statusCheckRollup?.map((check, index) => <p key={index}>
        {check.name || check.context || 'CI'}：{check.conclusion || check.state || check.status || t("client.chatReliability.awaitingConfirmation")}</p>)}
    </>}
    {model.prLoaded && !pr && <p className="chat-muted">{t("client.taskReview.thereIsNoOpenPrForThisBranch")}</p>}
    {!pr && <button type="button" className="chat-button" onClick={() => setCreating(!creating)}
      disabled={!model.enabled || model.busy || !revision || revision.dirty}>{t("client.taskReview.createDraftPr")}</button>}
    {revision?.dirty && <p className="chat-review-notice chat-muted">{t("client.taskReview.commitAndPushYourChangesFromGitBeforeCreatingA")}</p>}
    {creating && !pr && <div className="chat-review-form">
      <label>{t("client.taskReview.prTitle")}<input value={title} maxLength={200} onChange={event => setTitle(event.target.value)} /></label>
      <label>{t("client.taskReview.baseBranchLeaveBlankForDefault")}<input value={base} maxLength={200}
        onChange={event => setBase(event.target.value)} /></label>
      <label>{t("client.taskReview.prDescription")}<textarea rows={5} value={body} maxLength={16_000}
        onChange={event => setBody(event.target.value)} /></label>
      <button type="button" className="chat-button"
        disabled={!title.trim() || model.busy || !model.enabled || !revision || revision.dirty}
        onClick={() => { void model.createPr({ title, body, base }); }}>{t("client.taskReview.confirmDraftPr")}</button>
    </div>}
  </section>;
}

export function TaskReviewRestore({ model }: { model: TaskReviewModel }) {
  useLanguage();
  return <section className="chat-review-section">
    <h3>{t("client.taskReview.restoreThisTurnSChanges")}</h3>
    <p className="chat-muted chat-review-notice">{t("client.taskReview.newChangesAreCheckedFirstConflictingFilesWillNotBe")}</p>
    {model.restored ? <p>{t("client.taskReview.thisTurnSChangesHaveBeenRestored")}</p> : <button type="button" className="chat-text-action"
      disabled={!model.enabled || model.busy || model.running} onClick={() => { void model.previewRestore(); }}>
      {t("client.taskReview.previewRestore")}</button>}
    {model.restore && <div className="chat-review-confirm">
      <p>{t(model.restore.conflict ? "client.taskReview.filesContainOtherChangesAndCannotBeRestoredSafelyReview"
        : "client.taskReview.noConflictsFoundInThePreviewFilesWillBeChecked")}</p>
      {model.restore.files.map(path => <p className="chat-review-path" key={path}>{path}</p>)}
      <button type="button" className="chat-button"
        disabled={model.restore.conflict || model.busy || model.running || !model.enabled}
        onClick={() => { void model.confirmRestore(); }}>{t("client.taskReview.confirmRestore")}</button>
    </div>}
  </section>;
}
