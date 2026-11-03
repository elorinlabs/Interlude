import { useId, useRef, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { Popover } from 'antd';
import { MoreHorizontal } from 'lucide-react';
import { uiText } from '../../i18n/uiText';
import { useProjectBarOverflow } from './useProjectBarOverflow';
import styles from './ProjectBar.module.less';
import layout from './styles.module.less';

const FOCUSABLE = 'button:not(:disabled), [tabindex="0"]';

/** Keep a single copy of the controls mounted while moving them into the overflow popover. */
export function ProjectBar({ children, trailing, active, scope, barRef, hint }: {
  children: ReactNode; trailing?: ReactNode; active: boolean; scope: string;
  barRef?: RefObject<HTMLDivElement>; hint?: ReactNode;
}) {
  const fallbackBar = useRef<HTMLDivElement>(null);
  const bar = barRef ?? fallbackBar;
  const { trigger, content, setInlineTarget, setPopupTarget, compact, expanded, setOpen, close }
    = useProjectBarOverflow({ active, scope, bar });
  const id = useId();
  const label = uiText('client.conversationWorkspace.more');

  return <div ref={bar} className={layout.projectBar} data-project-bar data-compact={compact}>
    {hint}
    <div ref={setInlineTarget} className={styles.inline} hidden={compact} />
    <Popover trigger="click" placement="topLeft" arrow={false} open={expanded} onOpenChange={setOpen}
      afterOpenChange={visible => {
        if (visible && document.activeElement === trigger.current) {
          content.querySelector<HTMLElement>(FOCUSABLE)?.focus();
        }
      }}
      styles={{ root: { maxWidth: 400 }, body: { padding: 8, borderRadius: 16 } }}
      content={<div ref={setPopupTarget} id={id} role="dialog" aria-label={label} className={styles.panel} />}>
      <button ref={trigger} type="button" className={styles.more} hidden={!compact}
        aria-label={label} title={expanded ? undefined : label} aria-haspopup="dialog"
        aria-expanded={expanded} aria-controls={expanded ? id : undefined}
        onKeyDown={event => { if (event.key === 'Escape') close(); }}>
        <MoreHorizontal size={18} aria-hidden="true" />
      </button>
    </Popover>
    {trailing}
    {createPortal(<div className={styles.controls} onKeyDown={event => {
      if (expanded && event.key === 'Escape' && !event.defaultPrevented) {
        event.stopPropagation(); close();
      }
    }}>{children}</div>, content)}
  </div>;
}
