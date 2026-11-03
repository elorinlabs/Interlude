import { createContext } from 'react';
import type { UsageSummary } from '../remote-chat/usage';

/** Share the PC workspace's existing refresh between its composer and account summary. */
export const DesktopUsageContext = createContext<{ usage: UsageSummary | null; visible: boolean }>({
  usage: null, visible: true,
});
