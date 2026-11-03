import type { ReactNode } from 'react';
import { useThreadLongPress } from '../chat/useThreadLongPress';

export function MobileLoungeChatTrigger({ enabled, open, children }: {
  enabled: boolean; open: () => void; children: ReactNode;
}) {
  const gestures = useThreadLongPress(open, { enabled });
  return <div {...gestures} className="lounge-chat-action-trigger">{children}</div>;
}
