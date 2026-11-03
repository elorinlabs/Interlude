import { t, useLanguage } from '../i18n';
import { useState } from 'react';
import type { ApprovalReply, GuiEvent } from './types';

export function ChatApproval({ event, ready, respond }: {
  event: GuiEvent; ready: boolean; respond: (reply: ApprovalReply) => Promise<void>;
}) {
  useLanguage();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const { params, method, id } = event;
  if (id == null) return null;
  const questions = params.questions ?? [];
  const isQuestion = method === 'item/tool/requestUserInput';
  const send = async (decision: 'accept' | 'decline' | 'cancel') => {
    setBusy(true);
    try {
      await respond(isQuestion ? { id, answers: Object.fromEntries(questions.map((question) =>
        [question.id, { answers: [answers[question.id]?.trim() ?? ''] }])) } : { id, decision });
    } finally { setBusy(false); }
  };
  return <section className="chat-approval" aria-label={isQuestion ? t("client.chat.moreInformationNeeded") : t("client.chat.yourApprovalIsNeeded")}>
    <h2>{isQuestion ? t("client.chat.moreInformationNeeded") : t("client.chat.yourApprovalIsNeeded")}</h2>
    {params.reason && <p className="chat-muted">{params.reason}</p>}
    {params.command && <pre>{params.command}</pre>}
    {(params.cwd || params.grantRoot) && <p className="chat-muted">{params.cwd || params.grantRoot}</p>}
    {params.permissions?.network?.enabled && <p className="chat-muted">{t("client.chat.networkAccess")}</p>}
    {params.permissions?.fileSystem?.read?.map((path) => <p key={path} className="chat-muted">{t("client.chat.read")}{path}</p>)}
    {params.permissions?.fileSystem?.write?.map((path) => <p key={path} className="chat-muted">{t("client.chat.edit")}{path}</p>)}
    {questions.map((question) => <fieldset key={question.id} disabled={busy || !ready}>
      <legend>{question.question}</legend>
      {question.options?.map((option) => <label className="chat-choice" key={option.label}>
        <input type="radio" name={`${id}-${question.id}`} checked={answers[question.id] === option.label}
          onChange={() => setAnswers((current) => ({ ...current, [question.id]: option.label }))} />
        <span><strong>{option.label}</strong><small>{option.description}</small></span>
      </label>)}
      <input className="chat-answer" aria-label={question.question} placeholder={t("client.chat.enterYourAnswer")}
        type={question.isSecret ? 'password' : 'text'} autoComplete="off" value={answers[question.id] ?? ''}
        onChange={(change) => setAnswers((current) => ({ ...current, [question.id]: change.target.value }))} />
    </fieldset>)}
    <div className="chat-row">
      {(isQuestion || !params.availableDecisions || params.availableDecisions.includes('accept')) &&
        <button type="button" className="chat-button chat-primary"
          disabled={!ready || busy || (isQuestion && questions.some((question) => !answers[question.id]?.trim()))}
          onClick={() => { void send('accept'); }}>{isQuestion ? t("client.chat.submitAnswer") : t("client.chat.allowOnce")}</button>}
      {!isQuestion && <button type="button" className="chat-button" disabled={!ready || busy}
        onClick={() => { void send(params.availableDecisions?.includes('decline') === false ? 'cancel' : 'decline'); }}>
        {t("client.chat.deny")}</button>}
    </div>
  </section>;
}
