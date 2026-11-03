import { displayText } from '../i18n/index';
import { useState } from 'react';
import { Target, X } from 'lucide-react';
import { GOAL_STATUS, type ThreadGoal } from '../../../desktop/src/pages/codexGui/goalTypes';
import { AdaptiveSheet } from '../components/AdaptiveSheet';
import { t, useLanguage } from '../i18n';
import './composerGoal.css';

interface Props {
  goal?: ThreadGoal | null;
  draft: string;
  disabled: boolean;
  remove: () => void;
  beforeOpen: () => void;
}

export function ComposerGoal({ goal, draft, disabled, remove, beforeOpen }: Props) {
  useLanguage();
  const [open, setOpen] = useState(false);
  const objective = goal?.objective ?? draft.trim();
  return <>
    <div className="chat-composer-goal">
      <button type="button" className="chat-goal-preview" aria-label={t("client.chat.viewGoal")}
        aria-haspopup="dialog" aria-expanded={open} onClick={() => { beforeOpen(); setOpen(true); }}>
        <Target size={16} />
        <span className="chat-goal-content">
          <span className="chat-goal-label">{t(goal ? "client.chat.goal" : "client.chat.goalMode")}</span>
          {goal && <span className="chat-goal-objective">{goal.objective}</span>}
        </span>
      </button>
      <button type="button" className="chat-goal-remove" aria-label={t("client.mobile.removeGoal")} disabled={disabled}
        onClick={remove}><X size={16} /></button>
    </div>
    <AdaptiveSheet open={open} title={t(goal ? "client.chat.goalDetails" : "client.chat.goalMode")} width={400}
      className="chat-goal-sheet" onClose={() => setOpen(false)}>
      <div className="chat-goal-details">
        {goal && <p className="chat-goal-label">{displayText(GOAL_STATUS[goal.status])}</p>}
        <p className="chat-goal-objective">{objective || t("client.chat.describeYourGoal")}</p>
        {!goal && <p className="chat-goal-help">
          {t("client.composer.describeTheResultYouWantCodexWillKeepWorkingUntil")}
        </p>}
      </div>
    </AdaptiveSheet>
  </>;
}
