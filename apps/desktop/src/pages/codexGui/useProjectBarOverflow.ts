import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';

const COMPACT_WIDTH = 640;

export function useProjectBarOverflow({ active, scope, bar }: {
  active: boolean; scope: string; bar: RefObject<HTMLDivElement>;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const [content] = useState(() => document.createElement('div'));
  const [inlineTarget, setInlineTarget] = useState<HTMLDivElement | null>(null);
  const [popupTarget, setPopupTarget] = useState<HTMLDivElement | null>(null);
  const [compact, setCompact] = useState(false);
  const [open, setOpen] = useState(false);
  const expanded = compact && active && open;

  useLayoutEffect(() => {
    const element = bar.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => setCompact(entry.contentRect.width <= COMPACT_WIDTH));
    observer.observe(element);
    return () => observer.disconnect();
  }, [bar]);
  useLayoutEffect(() => {
    // Moving the portal's host preserves Git dialogs, fetched status and in-flight operations.
    const target = expanded && popupTarget ? popupTarget : inlineTarget;
    target?.appendChild(content);
  }, [content, expanded, inlineTarget, popupTarget]);
  useEffect(() => { setOpen(false); }, [active, scope, compact]);

  const close = () => { setOpen(false); trigger.current?.focus(); };
  return { trigger, content, setInlineTarget, setPopupTarget, compact, expanded, setOpen, close };
}
