import { message, Switch } from 'antd';
import { MessageCircleQuestion } from 'lucide-react';
import type { Language } from '../../i18n';
import { helpCopy } from '../../components/helpAssistant/copy';
import { useHelpAssistantVisibility } from '../../hooks/useHelpAssistantVisibility';

export function HelpAssistantSettingsCard({ language }: { language: Language }) {
  const { visible, setVisible } = useHelpAssistantVisibility();
  const copy = helpCopy(language);
  return <section className="settings-card">
    <div className="settings-icon"><MessageCircleQuestion size={23} /></div>
    <div className="settings-card-content">
      <div className="settings-card-copy">
        <h3>{copy.title}</h3><p>{copy.visibilityDescription}</p>
      </div>
      <div className="settings-field">
        <label htmlFor="help-assistant-visible">{copy.visibilityLabel}</label>
        <Switch id="help-assistant-visible" checked={visible}
          onChange={(next) => {
            if (!setVisible(next)) void message.error({ content: copy.visibilitySaveError,
              style: { maxWidth: 400, marginInline: 'auto' } });
          }} />
      </div>
    </div>
  </section>;
}
