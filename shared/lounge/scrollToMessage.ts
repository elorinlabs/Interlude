export function scrollToLoungeMessage(container: HTMLElement | null, key: string) {
  if (!container) return;
  const message = [...container.querySelectorAll<HTMLElement>('[data-lounge-message-key]')]
    .find(element => element.dataset.loungeMessageKey === key);
  if (!message) return;
  const bounds = message.getBoundingClientRect();
  const top = bounds.top - container.getBoundingClientRect().top + container.scrollTop;
  container.scrollTo({ top: Math.max(0, top - (container.clientHeight - bounds.height) / 2), behavior: 'instant' });
}
