import { displayError } from '../i18n/index';
import { useId, useState } from 'react';
import { AutoComplete, Button, Input, Modal, Spin } from 'antd';
import { CONTEXT_CAPACITY_PRESETS_K, type ContextSettingsApi } from '../../../../shared/remote-chat/contextSettings';
import { useContextSettings } from '../../../../shared/remote-chat/client/useContextSettings';
import { t, useLanguage } from '../i18n';

const capacityOptions = CONTEXT_CAPACITY_PRESETS_K.map(value => ({ value: String(value), label: `${value}K` }));

export function ComposerContextSettings({ threadId, api, onClose }: {
  threadId: string; api: ContextSettingsApi; onClose: () => void;
}) {
  useLanguage();
  const editor = useContextSettings(threadId, api);
  const [presetsOpen, setPresetsOpen] = useState(false);
  const id = useId();
  const save = async () => { if (await editor.save()) onClose(); };
  return <Modal open centered width={360} title={t("client.chat.conversationContext")}
    onCancel={() => { if (!editor.saving) onClose(); }}
    closable={editor.saving ? false : { 'aria-label': t("client.projectBrowser.close") }}
    maskClosable={!editor.saving} keyboard={!editor.saving} footer={<>
      <Button disabled={editor.saving} aria-label={t("client.accounts.cancel")} onClick={onClose}>{t("client.accounts.cancel")}</Button>
      <Button type="primary" aria-label={t("client.projectBrowser.save")} loading={editor.saving} disabled={editor.loading || !editor.loaded}
        onClick={() => { void save(); }}>{t("client.projectBrowser.save")}</Button>
    </>}>
    <div className="composer-context-settings">
      <p className="composer-context-hint">
        {t("client.chat.appliesToThisConversationImmediatelyAnActiveReplyWillPause")}</p>
      {editor.loading && <div role="status"><Spin size="small" /> {t("client.chat.loadingContextSettings")}</div>}
      {editor.loaded && <>
        <label htmlFor={id}>{t("client.chat.contextCapacityKTokens")}</label>
        <AutoComplete id={id} value={editor.value} options={capacityOptions} disabled={editor.saving}
          onChange={editor.setValue} onOpenChange={setPresetsOpen} defaultActiveFirstOption={false}>
          <Input aria-label={t("client.chat.contextCapacityKTokens")} inputMode="decimal"
            placeholder={t("client.chat.chooseOrEnterACapacityLeaveBlankForDefault")} onPressEnter={event => {
              event.preventDefault();
              if (!presetsOpen && !event.nativeEvent.isComposing) void save();
            }} />
        </AutoComplete>
        <div className="composer-context-help">
          <span className="composer-context-hint">{t("client.chat.1K1000TokensLeaveBlankToUseThe")}</span>
          <Button type="link" size="small" disabled={editor.saving}
            onClick={() => editor.setValue('')}>{t("client.chat.restoreDefaults")}</Button>
        </div>
        <p className="composer-context-hint">{t("client.chat.usageUpdatesAfterAReplyAvailableCapacityDependsOnModel")}</p>
      </>}
      {editor.error && <div role="alert" className="chat-error">{displayError(editor.error)}
        {!editor.loaded && <Button type="link" size="small" onClick={editor.retry}>{t("client.terminal.retry")}</Button>}
      </div>}
    </div>
  </Modal>;
}
