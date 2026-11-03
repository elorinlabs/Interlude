/** The desktop host assigns this provenance after receiving a message on an authenticated chat link. */
export function hasDirectChatInput(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const request = value as Record<string, unknown>;
  if (request.operation === 'send' || request.operation === 'steer') return request.transferMode === 'direct';
  return request.operation === 'sendBatch' && Array.isArray(request.messages)
    && request.messages.some((message: unknown) => message !== null && typeof message === 'object'
      && (message as Record<string, unknown>).transferMode === 'direct');
}
