import { useMemo, useSyncExternalStore } from 'react';
import { ChevronsDownUp, ChevronsUpDown } from 'lucide-react';
import { getInterfaceLanguage, subscribeInterfaceLanguage } from '../localization/interfaceLanguage';
import { displayText as t } from '../localization/messages';
import { MEBIBYTE, previewByteLength } from './jsonHighlightLimit';
import { useJsonHighlightLimit } from './useJsonHighlightLimit';
import { useJsonPreview } from './useJsonPreview';
import './jsonPreview.css';

export function JsonPreview({ text, size, line }: { text: string; size?: number; line?: number }) {
  useSyncExternalStore(subscribeInterfaceLanguage, getInterfaceLanguage);
  const limit = useJsonHighlightLimit();
  const bytes = useMemo(() => previewByteLength(text, size), [text, size]);
  const plain = bytes > limit * MEBIBYTE;
  const lineCount = useMemo(() => text.split(/\r\n?|\n/).length, [text]);
  const label = t('client.workspaceActions.fileContent');
  const editor = useJsonPreview({ text, plain, line, label });
  return <section className="json-file-preview" data-plain-text={plain}>
    <div className="json-preview-info"><span>{t('client.filePreview.jsonLines', { count: lineCount })}</span>
      {!plain && <div className="json-preview-tools">
        <button type="button" disabled={editor.status !== 'ready' || editor.busy}
          aria-busy={editor.busy} onClick={editor.fold}>
          <ChevronsDownUp size={14} aria-hidden="true" />{t('client.projectBrowser.foldAll')}</button>
        <button type="button" disabled={editor.status !== 'ready'} onClick={editor.unfold}>
          <ChevronsUpDown size={14} aria-hidden="true" />{t('client.projectBrowser.unfoldAll')}</button>
      </div>}
      {plain && <span role="status">{t('client.filePreview.jsonPlainText', { limit })}</span>}
      {editor.status === 'failed' && <span role="status">{t('client.projectBrowser.syntaxHighlightingIsUnavailable')}</span>}
    </div>
    <div className="json-preview-editor" ref={editor.host} />
  </section>;
}
