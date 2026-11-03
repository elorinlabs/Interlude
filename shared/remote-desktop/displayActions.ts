import type { MutableRefObject } from 'react';
import type { DesktopDisplaySession } from './displaySession';

export interface DisplayAction {
  allowed: boolean;
  receiver: MutableRefObject<DesktopDisplaySession | undefined>;
  updating: MutableRefObject<boolean>;
  saving: (value: boolean) => void;
  status: (value: string) => void;
  release: () => void;
  message: string;
  run: (receiver: DesktopDisplaySession) => Promise<unknown>;
}

/** One display transaction owns input release and UI feedback until its receiver changes. */
export async function changeDesktopDisplay(action: DisplayAction) {
  const current = action.receiver.current;
  if (!action.allowed || !current || action.updating.current) return;
  action.updating.current = true; action.saving(true); action.release(); action.status(action.message);
  try {
    await action.run(current);
    if (action.receiver.current === current) action.status('');
  } catch (error) {
    if (action.receiver.current === current) {
      action.status(typeof error === 'string' ? error
        : error instanceof Error ? error.message : '显示设置未能保存，请重试。');
    }
  } finally { action.updating.current = false; action.saving(false); }
}
