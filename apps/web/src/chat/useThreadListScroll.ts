import { useViewportThreadPagination } from '../../../../shared/remote-chat/client/useViewportThreadPagination';
import type { ChatController, ChatState } from './types';

export function useThreadListScroll(state: ChatState, controller: ChatController, enabled = true) {
  return useViewportThreadPagination({
    enabled: enabled && state.ready,
    loading: state.loading,
    scope: JSON.stringify([state.archived, state.search, state.ready]),
    cursor: state.cursor,
    loadMore: () => controller.list({ more: true }),
  });
}
