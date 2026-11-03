import { useCallback, useLayoutEffect, useRef, useState, type TouchEvent, type WheelEvent } from 'react';
import type { ChatMessagesProps } from '../../../../shared/remote-chat/client/messageProps';
import { isNearHistoryStart, shouldFollowScroll, shouldShowScrollToBottom }
  from '../../../../shared/chat/scrollPosition';
import { useScrollMovement } from '../../../../shared/chat/useScrollMovement';
import { useHistoryPull } from '../../../../shared/chat/useHistoryPull';
import { useHistoryContinuation } from '../../../../shared/chat/useHistoryContinuation';

const TOP_TOLERANCE = 1;

function canScrollUp(target: EventTarget, container: HTMLElement) {
  let element = target instanceof Element ? target : null;
  while (element && element !== container) {
    if (element.scrollTop > 0 && /^(auto|scroll)$/.test(getComputedStyle(element).overflowY)) return true;
    element = element.parentElement;
  }
  return false;
}

export function useHistoryScroll({ thread, loading, loadingMore, hasMore, loadOlder, historyLoad }: ChatMessagesProps) {
  const list = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const [showBottom, setShowBottom] = useState(false);
  const fetching = useRef(false);
  const movement = useScrollMovement();
  const anchor = useRef<{ element: Element; top: number }>();
  const scope = useRef(thread?.id);
  useLayoutEffect(() => {
    scope.current = thread?.id;
    following.current = true;
    fetching.current = false;
    anchor.current = undefined;
    movement.remember(list.current);
  }, [thread?.id, movement]);
  const updateScrollButton = useCallback(() => {
    const node = list.current;
    if (node) setShowBottom(shouldShowScrollToBottom({
      contentHeight: node.scrollHeight, viewportHeight: node.clientHeight, offset: node.scrollTop,
    }));
  }, []);
  const more = () => {
    if (!hasMore || loading || loadingMore || fetching.current || !loadOlder || !list.current) return;
    continueHistory();
    following.current = false;
    const top = list.current.getBoundingClientRect().top;
    const element = [...list.current.querySelectorAll('[data-message-id]')]
      .find((item) => item.getBoundingClientRect().bottom > top);
    if (element) anchor.current = { element, top: element.getBoundingClientRect().top };
    fetching.current = true;
    const current = scope.current;
    void loadOlder().finally(() => { if (scope.current === current) fetching.current = false; });
  };
  const continueHistory = useHistoryContinuation({
    threadId: thread?.id, result: historyLoad, hasMore, loading: Boolean(loading || loadingMore), loadOlder: more,
    nearTop: () => Boolean(list.current && isNearHistoryStart({
      offset: list.current.scrollTop, viewportHeight: list.current.clientHeight,
    })),
  });
  const pull = useHistoryPull(() => Boolean(list.current && list.current.scrollTop <= TOP_TOLERANCE), more);
  const touchPoint = (event: TouchEvent<HTMLDivElement>) => {
    const touch = event.touches.length === 1 ? event.touches[0] : undefined;
    return touch && !event.defaultPrevented && !canScrollUp(event.target, event.currentTarget)
      ? { x: touch.pageX, y: touch.pageY } : undefined;
  };
  const onTouchStart = (event: TouchEvent<HTMLDivElement>) => pull.begin(touchPoint(event));
  const onTouchMove = (event: TouchEvent<HTMLDivElement>) => pull.move(touchPoint(event));
  useLayoutEffect(() => {
    const node = list.current;
    if (!node) return;
    if (anchor.current?.element.isConnected) {
      node.scrollTop += anchor.current.element.getBoundingClientRect().top - anchor.current.top;
    } else if (following.current) node.scrollTop = node.scrollHeight;
    movement.remember(node);
    updateScrollButton();
    if (!loadingMore) anchor.current = undefined;
  }, [thread, loadingMore, updateScrollButton, movement]);
  useLayoutEffect(() => {
    const follow = () => {
      if (following.current && list.current) {
        list.current.scrollTop = list.current.scrollHeight;
      }
      movement.remember(list.current);
      updateScrollButton();
    };
    const observer = new ResizeObserver(follow);
    if (body.current) observer.observe(body.current, { box: 'border-box' });
    if (list.current) observer.observe(list.current);
    follow();
    return () => observer.disconnect();
  }, [updateScrollButton, movement]);
  const onScroll = () => {
    const node = list.current;
    if (!node) return;
    const offsetChange = movement.read(node);
    // Layout and resize effects already remember their restored position before the scroll event arrives.
    if (offsetChange === 0) return;
    following.current = shouldFollowScroll({ contentHeight: node.scrollHeight, viewportHeight: node.clientHeight,
      offset: node.scrollTop, movement: offsetChange });
    updateScrollButton();
    if (offsetChange < 0 && isNearHistoryStart({ offset: node.scrollTop, viewportHeight: node.clientHeight })) more();
  };
  const onWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (event.deltaY >= 0 || event.ctrlKey || event.defaultPrevented) return;
    if (canScrollUp(event.target, event.currentTarget)) return;
    following.current = false;
    if (event.currentTarget.scrollTop > 0) return;
    // At the top (including short histories), upward wheels do not produce a scroll event.
    more();
  };
  const toBottom = () => {
    following.current = true;
    setShowBottom(false);
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: 'smooth' });
  };
  const pauseFollowing = () => { following.current = false; };
  return { list, content, body, onScroll, onWheel, more, showBottom, toBottom, pauseFollowing,
    onTouchStart, onTouchMove, onTouchEnd: pull.clear, onTouchCancel: pull.clear };
}
