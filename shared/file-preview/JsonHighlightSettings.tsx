import { useEffect, useId, useState } from 'react';
import type { MessageTranslator } from '../localization/messages';
import { MAX_JSON_HIGHLIGHT_MB, MIN_JSON_HIGHLIGHT_MB } from './jsonHighlightLimit';
import { saveJsonHighlightLimit, useJsonHighlightLimit } from './useJsonHighlightLimit';
import './jsonHighlightSettings.css';

export function JsonHighlightSettings({ t }: { t: MessageTranslator }) {
  const limit = useJsonHighlightLimit();
  const [draft, setDraft] = useState(String(limit));
  const hint = useId();
  useEffect(() => setDraft(String(limit)), [limit]);
  return <div className="json-highlight-settings">
    <label><span>{t('client.filePreview.jsonHighlightLimit')}</span>
      <input type="number" min={MIN_JSON_HIGHLIGHT_MB} max={MAX_JSON_HIGHLIGHT_MB} step={1}
        value={draft} aria-describedby={hint} onChange={event => {
          setDraft(event.target.value);
          if (event.target.value && event.target.validity.valid) saveJsonHighlightLimit(event.target.valueAsNumber);
        }} onBlur={() => setDraft(String(limit))} />
    </label>
    <p id={hint}>{t('client.filePreview.jsonHighlightHint', { min: MIN_JSON_HIGHLIGHT_MB, max: MAX_JSON_HIGHLIGHT_MB })}</p>
  </div>;
}
