import type { Thread } from './types';

export interface ChatMessagesProps {
  thread: Thread | null;
  loading?: boolean;
  offline?: boolean;
  loadingMore?: boolean;
  hasMore?: boolean;
  historyLoad?: import('./historyLoad').HistoryLoadResult;
  loadOlder?: () => Promise<void>;
}
