import { remoteErrorText } from '../localization/errors';
import type { ReactNode } from 'react';
import { GripVertical, Pencil, MessageSquarePlus, Scan, Eraser, RectangleHorizontal } from 'lucide-react';
import { IMAGE_AI_TOOLS } from './imageAiEdit';
import { useImageAiEdit } from './useImageAiEdit';
import './imageAiToolbar.css';

const icons = [Pencil, MessageSquarePlus, Scan, Eraser, RectangleHorizontal];
export function ImageAiToolbar({ load, close, translate: t, originalAction }: {
  load: () => Promise<string>; close: () => void; translate: (text: string) => string;
  originalAction?: ReactNode;
}) {
  const editor = useImageAiEdit({ load, close });
  if (!editor.available) return originalAction ?? null;
  const selected = IMAGE_AI_TOOLS.find(item => item.id === editor.tool);
  return <div className="cs-image-ai">
    {selected && <form className="cs-image-ai-form" onSubmit={event => {
      event.preventDefault(); void editor.submit();
    }}>
      <strong>{t(selected.label)}</strong>
      <label>{t(selected.hint)}<textarea value={editor.detail} maxLength={2000} disabled={editor.busy}
        onChange={event => editor.setDetail(event.target.value)} /></label>
      {editor.tool === 'resize' && <div className="cs-image-ai-dimensions">
        <label>{t("client.imageAi.widthPixels")}<input inputMode="numeric" value={editor.width} disabled={editor.busy}
          onChange={event => editor.setWidth(event.target.value)} /></label>
        <label>{t("client.imageAi.heightPixels")}<input inputMode="numeric" value={editor.height} disabled={editor.busy}
          onChange={event => editor.setHeight(event.target.value)} /></label>
      </div>}
      <p>{t("client.imageAi.theEditedImageWillAppearInThisConversation")}</p>
      {editor.error && <p role="alert">{remoteErrorText(editor.error)}</p>}
      <div className="cs-image-ai-actions">
        <button type="button" disabled={editor.busy} onClick={() => editor.select(null)}>{t("client.accounts.cancel")}</button>
        <button type="submit" disabled={editor.busy || !editor.enabled}>
          {t(editor.busy ? "client.imageAi.submitting" : "client.imageAi.editWithAi")}</button>
      </div>
    </form>}
    <div className="cs-image-ai-tools" role="toolbar" aria-label={t("client.imageAi.imageEditing")}>
      <GripVertical size={18} aria-hidden="true" />
      {originalAction}
      {IMAGE_AI_TOOLS.map((item, index) => {
        const Icon = icons[index];
        return <button type="button" key={item.id} disabled={editor.busy || !editor.enabled}
          aria-pressed={editor.tool === item.id} onClick={() => editor.select(item.id)}>
          <Icon size={20} aria-hidden="true" /><span>{t(item.label)}</span></button>;
      })}
    </div>
  </div>;
}
