import { useEffect, useId, useRef, useState } from 'react';
import { Popover } from 'antd';
import { Settings } from 'lucide-react';
import { contextUsage, FULL_PERCENT } from '../../../desktop/src/pages/codexGui/contextUsage';
import { formatCompactTokenCount } from '../../../desktop/src/utils/tokenContext';
import type { ContextSettings, ContextSettingsApi } from '../../../../shared/remote-chat/contextSettings';
import { t, useLanguage } from '../i18n';
import type { ComposerProps } from './composerProps';
import { ComposerContextSettings } from './ComposerContextSettings';
import './composerContext.css';

function CapacityHint({ threadId, api }: { threadId: string; api: ContextSettingsApi }) {
  const language = useLanguage();
  const [settings, setSettings] = useState<ContextSettings | null>(null);
  useEffect(() => {
    let cancelled = false;
    void api.read(threadId).then(value => { if (!cancelled) setSettings(value); }).catch(() => {
      // Usage remains available; the settings dialog offers a retry if reading fails.
    });
    return () => { cancelled = true; };
  }, [threadId, api]);
  if (settings?.capacity == null) return null;
  return <div className="composer-context-hint">
    <div>{t("client.chat.chatCapacityTokens", { capacity: formatCompactTokenCount(settings.capacity, language) })}</div>
    <div>{t("client.chat.usageIsFromTheLatestReplyAvailableCapacityExcludesReserved")}</div>
  </div>;
}

export function ComposerContext({ tokenUsage, threadId, contextSettings, ready, beforeOpen }: Pick<ComposerProps,
  'tokenUsage' | 'threadId' | 'contextSettings' | 'ready'> & { beforeOpen: () => void }) {
  const language = useLanguage();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const context = contextUsage(tokenUsage);
  const percent = context?.percent;
  const close = () => { setOpen(false); trigger.current?.focus(); };
  const content = <div id={id} className="composer-context-content" role="dialog" aria-label={t("client.chat.contextWindow")}
    onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); close(); } }}>
    <div className="composer-context-heading"><span>{t("client.chat.contextWindow")}</span>
      <button type="button" className="composer-context-button" aria-label={t("client.chat.setContextCapacityForThisChat")}
        disabled={!threadId || !ready} onClick={() => { setOpen(false); setEditing(true); }}>
        <Settings size={14} aria-hidden="true" />
      </button>
    </div>
    {!threadId && <div className="composer-context-hint">{t("client.chat.selectAChatToSetItsCapacity")}</div>}
    {context ? <>
      <div>{percent != null ? t("client.chat.usedRemaining", {
        percent, remaining: FULL_PERCENT - percent,
      }) : t("client.chat.contextCapacityUnknown")}</div>
      <div>{t("client.chat.tokensUsed", { used: formatCompactTokenCount(context.used, language) })}
        {context.capacity !== null && t("client.chat.total", {
          capacity: formatCompactTokenCount(context.capacity, language),
        })}</div>
    </> : <div>{t("client.shared.noContextUsageYet")}</div>}
    {open && threadId && ready && <CapacityHint threadId={threadId} api={contextSettings} />}
  </div>;
  return <>
    <Popover content={content} fresh destroyOnHidden trigger="click" placement="top" arrow={false} open={open}
      onOpenChange={value => { if (value) beforeOpen(); setOpen(value); }}
      styles={{ root: { maxWidth: 'min(400px, calc(100vw - 24px))', visibility: open ? 'visible' : 'hidden' },
        body: { padding: '6px 10px', borderRadius: 12 } }}>
      <button ref={trigger} type="button" className="composer-context-button" aria-label={t("client.chat.viewContextUsage")}
        aria-haspopup="dialog" aria-expanded={open} aria-describedby={open ? id : undefined}
        onKeyDown={event => { if (event.key === 'Escape') close(); }}>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" opacity=".2" />
          <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" pathLength={FULL_PERCENT}
            strokeDasharray={`${percent ?? 0} ${FULL_PERCENT}`} transform="rotate(-90 8 8)" />
        </svg>
      </button>
    </Popover>
    {editing && threadId && <ComposerContextSettings threadId={threadId} api={contextSettings}
      onClose={() => { setEditing(false); trigger.current?.focus(); }} />}
  </>;
}
