import { useEffect, useRef, useState } from 'react';

/** Keep a failed first goal editable when creating its conversation changes the draft scope. */
export function useGoalMode(threadId: string | null, sending: boolean) {
  const [enabled, setEnabled] = useState(false);
  const previous = useRef(threadId);
  useEffect(() => {
    if (previous.current === threadId) return;
    const creating = previous.current === null && sending;
    previous.current = threadId;
    if (!creating) setEnabled(false);
  }, [threadId, sending]);
  return { enabled, enter: () => setEnabled(true), exit: () => setEnabled(false) };
}
