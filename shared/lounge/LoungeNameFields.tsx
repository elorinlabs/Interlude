import { Button, Input } from 'antd';
import { displayText as t } from '../localization/messages';
import { useLoungeNameEditor, type LoungeNameEditorOptions } from './useLoungeNameEditor';
import './nameFields.css';

export function LoungeNameFields(props: LoungeNameEditorOptions) {
  const editor = useLoungeNameEditor(props);
  const label = t(editor.own ? 'client.lounge.nickname' : 'client.lounge.remark');
  return <div className="lounge-name-fields">
    {!editor.own && <div className="lounge-name-readonly"><span>{t('client.lounge.nickname')}</span>
      <strong>{props.user.nickname || t('client.lounge.nameNotSet')}</strong></div>}
    <form onSubmit={event => { event.preventDefault(); void editor.save(); }}>
      <label htmlFor="lounge-profile-name">{label}</label>
      <p className="lounge-name-hint">{t(editor.own ? 'client.lounge.nicknameHint' : 'client.lounge.remarkHint')}</p>
      <Input id="lounge-profile-name" value={editor.value} onChange={event => editor.change(event.target.value)}
        disabled={editor.busy} aria-label={label} autoComplete="off" status={editor.invalid ? 'error' : undefined}
        placeholder={t('client.lounge.nameNotSet')} />
      <p className="lounge-name-hint">{t('client.lounge.nameLimit', { limit: editor.limit })}</p>
      {!editor.available && <p role="status">{t('client.lounge.namesUnavailable')}</p>}
      {editor.invalid && <p role="alert">{t('client.lounge.nameInvalid', { limit: editor.limit })}</p>}
      {editor.error && <p role="alert">{t(editor.error)}</p>}
      {editor.saved && <p role="status">{t('client.lounge.nameSaved')}</p>}
      <Button type="primary" htmlType="submit" disabled={!editor.canSave} loading={editor.busy}
        aria-label={t('client.lounge.saveName')}>
        {t('client.lounge.saveName')}</Button>
    </form>
  </div>;
}
