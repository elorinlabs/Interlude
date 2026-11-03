import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { selectedQuote, type SelectedQuote } from "./selectedQuote";

function selectionIdentity() {
  const selection = window.getSelection();
  if (!selection?.rangeCount) return null;
  const range = selection.getRangeAt(0);
  return { range, start: range.startContainer, end: range.endContainer,
    startOffset: range.startOffset, endOffset: range.endOffset };
}

type SelectionIdentity = ReturnType<typeof selectionIdentity>;
function sameSelection(left: SelectionIdentity, right: SelectionIdentity) {
  return left && right && left.range === right.range && left.start === right.start && left.end === right.end
    && left.startOffset === right.startOffset && left.endOffset === right.endOffset;
}

export function useQuoteSelection({ root, selected, enabled }: {
  root: RefObject<HTMLDivElement>; selected: string | null; enabled: boolean;
}) {
  const [selection, setSelection] = useState<SelectedQuote | null>(null);
  const dismissed = useRef<SelectionIdentity>(null);
  const dismiss = useCallback(() => {
    dismissed.current = selectionIdentity();
    setSelection(null);
  }, []);
  useEffect(() => {
    dismissed.current = null;
    setSelection(null);
    if (!enabled || !selected) return;
    const inspect = () => {
      // A queued selectionchange must not reopen a menu dismissed by scrolling or Escape.
      if (sameSelection(dismissed.current, selectionIdentity())) return;
      dismissed.current = null;
      setSelection(root.current ? selectedQuote(root.current) : null);
    };
    const keyDown = (event: KeyboardEvent) => { if (event.key === "Escape") dismiss(); };
    document.addEventListener("selectionchange", inspect);
    document.addEventListener("keydown", keyDown);
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    return () => {
      document.removeEventListener("selectionchange", inspect);
      document.removeEventListener("keydown", keyDown);
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("resize", dismiss);
    };
  }, [root, selected, enabled, dismiss]);
  return { selection: enabled ? selection : null, dismiss };
}
