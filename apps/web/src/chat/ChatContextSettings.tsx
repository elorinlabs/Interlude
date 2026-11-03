import { displayError } from '../i18n/index';
import { t, useLanguage } from '../i18n';
import { AdaptiveSheet } from '../components/AdaptiveSheet';
import { CONTEXT_CAPACITY_PRESETS_K, type ContextSettingsApi } from '../../../../shared/remote-chat/contextSettings';
import { useContextSettings } from '../../../../shared/remote-chat/client/useContextSettings';

export function ChatContextSettings({ threadId, api, onClose }: {
  threadId: string; api: ContextSettingsApi; onClose: () => void;
}) {
  useLanguage();
  const editor = useContextSettings(threadId, api);
  const close = () => { if (!editor.saving) onClose(); };
  const save = async () => { if (await editor.save()) onClose(); };
  return <AdaptiveSheet open title={t("client.chat.conversationContext")} width={400} onBack={close} onClose={close}>
    <div className="chat-settings">
      <p className="chat-muted">{t("client.chat.appliesToThisConversationImmediatelyAnActiveReplyWillPause")}</p>
      {editor.loading && <p role="status">{t("client.chat.loadingContextSettings")}</p>}
      {editor.loaded && <>
        <label htmlFor="chat-context-capacity">{t("client.chat.contextCapacityKTokens")}</label>
        <input id="chat-context-capacity" className="chat-answer" inputMode="decimal" value={editor.value}
          onChange={event => editor.setValue(event.target.value)} disabled={editor.saving} placeholder={t("client.chat.selectOrEnterCapacity")} />
        <div className="chat-context-presets">{CONTEXT_CAPACITY_PRESETS_K.map(capacity =>
          <button key={capacity} type="button" className="chat-button" disabled={editor.saving}
            aria-pressed={Number(editor.value) === capacity} onClick={() => editor.setValue(String(capacity))}>
            {capacity}K</button>)}</div>
        <p className="chat-muted">{t("client.chat.1K1000TokensLeaveBlankToUseThe")}</p>
        <p className="chat-muted">{t("client.chat.usageUpdatesAfterAReplySomeSpaceIsReservedSo")}</p>
        <button type="button" className="chat-button" disabled={editor.saving}
          onClick={() => editor.setValue('')}>{t("client.chat.restoreDefaults")}</button>
      </>}
      {editor.error && <p role="alert" className="chat-error">{displayError(editor.error)}</p>}
      {!editor.loading && !editor.loaded && <button type="button" className="chat-button"
        onClick={editor.retry}>{t("client.terminal.retry")}</button>}
      <div className="chat-row"><button type="button" className="chat-button" disabled={editor.saving}
        onClick={close}>{t("client.accounts.cancel")}</button><button type="button" className="chat-button chat-primary"
        disabled={editor.loading || !editor.loaded || editor.saving} onClick={() => { void save(); }}>
        {editor.saving ? t("client.projectBrowser.saving") : t("client.projectBrowser.save")}</button></div>
    </div>
  </AdaptiveSheet>;
}
