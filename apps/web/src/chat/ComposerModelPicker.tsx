import { displayText } from '../i18n/index';
import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Button, Input, Popover, Tooltip } from 'antd';
import { Check, ChevronLeft, ChevronRight, RotateCcw, Search } from 'lucide-react';
import { EFFORT_LABELS } from '../../../../shared/remote-chat/composer';
import { modelSelectionError, resolveModelSelection } from '../../../desktop/src/pages/codexGui/modelSelection';
import { t, useLanguage } from '../i18n';
import type { ComposerProps } from './composerProps';
import type { Model } from './types';
import './composerModelPicker.css';
import { RequestSpeedButton } from '../../../../shared/remote-chat/RequestSpeedButton';
import { requestSpeedSuffix } from '../../../../shared/remote-chat/requestSpeed';
import { ComposerSpeedIndicator } from './ComposerSpeedIndicator';
import { ModelRefreshButton } from './ModelRefreshButton';

const EFFORT_ORDER = Object.keys(EFFORT_LABELS);
const MODEL_SEARCH_THRESHOLD = 8;

function moveModelFocus(event: KeyboardEvent<HTMLDivElement>) {
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
  const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role=menuitemradio]'));
  const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
  let next = (current + (event.key === 'ArrowUp' ? -1 : 1) + buttons.length) % buttons.length;
  if (event.key === 'Home') next = 0;
  if (event.key === 'End') next = buttons.length - 1;
  event.preventDefault();
  buttons[next]?.focus();
}

function ModelList({ models, model, onSelect, onBack, titleAction }: {
  models: Model[]; model: string; onSelect: (model: string) => void; onBack: () => void;
  titleAction: ReactNode;
}) {
  const [query, setQuery] = useState('');
  const options = models.filter(entry => `${entry.displayName} ${entry.model}`.toLowerCase()
    .includes(query.trim().toLowerCase()));
  return <div className="composer-model-list-panel">
    <div className="composer-model-list-header">
      <button type="button" className="composer-model-list-heading" onClick={onBack}
        aria-label={t("client.chat.backToReasoningEffort")}><ChevronLeft size={12} /><span>{t("client.shared.chooseModel")}</span></button>
      {titleAction}
    </div>
    {models.length > MODEL_SEARCH_THRESHOLD && <Input size="small" className="composer-model-search"
      prefix={<Search size={12} />} placeholder={t("client.chat.searchModels")} aria-label={t("client.chat.searchModels")}
      value={query} allowClear onChange={event => setQuery(event.target.value)} />}
    <div className="composer-model-list" role="menu" aria-label={t("client.shared.chooseModel")} onKeyDown={moveModelFocus}>
      {options.map(entry => <button key={entry.model} type="button" role="menuitemradio"
        className="composer-model-option" aria-checked={model === entry.model}
        autoFocus={models.length <= MODEL_SEARCH_THRESHOLD && model === entry.model}
        onClick={() => onSelect(entry.model)}>
        <span>{entry.displayName || entry.model}</span>{model === entry.model && <Check size={14} />}
      </button>)}
      {!options.length && <p className="composer-model-hint">{t("client.chat.noModelsFound")}</p>}
    </div>
  </div>;
}

export function ComposerModelPicker({ models, selection, updateSettings, settingsBusy, ready, refreshModels,
  beforeOpen }: Pick<ComposerProps,
  'models' | 'selection' | 'updateSettings' | 'settingsBusy' | 'ready' | 'refreshModels'>
  & { beforeOpen: () => void }) {
  useLanguage();
  const [open, setOpen] = useState(false);
  const [choosingModel, setChoosingModel] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLButtonElement>(null);
  const { model, effort } = resolveModelSelection(models, selection);
  const unavailable = modelSelectionError(models, { model, effort });
  const selected = models.find(entry => entry.model === model);
  const modelLabel = selected?.displayName || model || t("client.shared.syncingModels");
  const effortLabel = displayText(EFFORT_LABELS[effort] || effort);
  const recommended = resolveModelSelection(models, { model, effort: '' });
  const levels = [...(selected?.supportedReasoningEfforts ?? [])].sort((left, right) =>
    EFFORT_ORDER.indexOf(left.reasoningEffort) - EFFORT_ORDER.indexOf(right.reasoningEffort));
  const index = Math.max(0, levels.findIndex(level => level.reasoningEffort === effort));
  const changeOpen = (next: boolean) => {
    if (next) beforeOpen();
    setOpen(next);
    setChoosingModel(false);
  };
  const returnToReasoning = () => { setChoosingModel(false); requestAnimationFrame(() => heading.current?.focus()); };
  const panel = <div className="composer-model-panel" role="dialog" aria-label={t("client.chat.modelAndReasoningEffort")}
    onKeyDown={event => {
      if (event.key === 'Escape') { event.stopPropagation(); changeOpen(false); trigger.current?.focus(); }
    }}>
    {choosingModel ? <ModelList models={models} model={model} onBack={returnToReasoning}
      titleAction={<ModelRefreshButton compact ready={ready} refreshModels={refreshModels} />}
      onSelect={value => {
        void updateSettings(resolveModelSelection(models, { model: value, effort: '' })); returnToReasoning();
      }} /> : <div className="composer-model-reasoning">
      <div className="composer-model-summary">
        {selection.speed !== undefined && <span className="composer-model-speed">
          <RequestSpeedButton speed={selection.speed} busy={settingsBusy} translate={displayText}
            onChange={speed => { void updateSettings({ speed }); }} />
        </span>}
        <button ref={heading} type="button" className="composer-model-heading" aria-label={t("client.shared.chooseModel")}
          onClick={() => setChoosingModel(true)}>
          <span className="composer-model-effort">{effortLabel}<ChevronRight size={12} /></span>
          <span className="composer-model-name">{modelLabel}</span>
        </button>
        <Tooltip title={t("client.chat.resetToRecommendedReasoningEffort")} styles={{ root: { maxWidth: 400 } }}>
          <Button type="text" size="small" className="composer-model-reset" icon={<RotateCcw size={14} />}
            disabled={!selected || effort === recommended.effort}
            aria-label={t("client.chat.resetToRecommendedReasoningEffort")}
            onClick={() => { void updateSettings(recommended); }} />
        </Tooltip>
      </div>
      {levels.length ? <div className="composer-model-slider-wrap">
        <input type="range" className="composer-model-slider" min={0} max={Math.max(1, levels.length - 1)}
          step={1} value={index} disabled={levels.length < 2} aria-label={t("client.shared.reasoningEffort")} aria-valuetext={effortLabel}
          onChange={event => { void updateSettings({ model, effort: levels[Number(event.target.value)].reasoningEffort }); }} />
        <div className="composer-model-stops" aria-hidden="true">
          {levels.map(level => <i key={level.reasoningEffort} />)}
        </div>
      </div> : <p className="composer-model-hint">{t("client.chat.thisModelDoesNotSupportAdjustableReasoningEffort")}</p>}
    </div>}
  </div>;
  return <Popover trigger="click" placement="topRight" arrow={false} open={open && !!model}
    onOpenChange={changeOpen} content={panel} destroyOnHidden styles={{ root: { maxWidth: 400 },
      body: { padding: 0, borderRadius: 16, overflow: 'hidden', boxShadow: '0 4px 16px rgb(0 0 0 / 8%)' } }}>
    <Tooltip title={unavailable ? t(unavailable) : undefined} styles={{ root: { maxWidth: 400 } }}>
    <button ref={trigger} type="button" className="chat-model" disabled={!model}
      data-model-unavailable={unavailable ? true : undefined}
      aria-haspopup="dialog" aria-expanded={open && !!model}
      aria-label={t("client.chat.modelAndReasoningEffort.bae75e", { model: modelLabel, effort: effortLabel })
        + requestSpeedSuffix(selection.speed, displayText)}
      onKeyDown={event => { if (event.key === 'Escape') changeOpen(false); }}>
      <span className="chat-model-name">{modelLabel}</span>
      {effortLabel && <span className="chat-model-effort">{effortLabel}</span>}
      <ComposerSpeedIndicator speed={selection.speed} />
    </button>
    </Tooltip>
  </Popover>;
}
