(() => {
  const root = window.__codexRoot;
  if (!root) return null;
  const queue = [root._internalRoot?.current ?? root];
  const seen = new Set();
  let queryClient = null;
  while (queue.length && seen.size < 50000) {
    const fiber = queue.shift();
    if (!fiber || typeof fiber !== "object" || seen.has(fiber)) continue;
    seen.add(fiber);
    const candidates = [
      fiber.memoizedProps?.client,
      fiber.pendingProps?.client,
      fiber.memoizedState?.client,
    ];
    queryClient = candidates.find(candidate =>
      candidate && typeof candidate.getQueryCache === "function" &&
      typeof candidate.invalidateQueries === "function" &&
      typeof candidate.setQueryData === "function"
    ) ?? null;
    if (queryClient) break;
    if (fiber.child) queue.push(fiber.child);
    if (fiber.sibling) queue.push(fiber.sibling);
  }
  return queryClient;
})()