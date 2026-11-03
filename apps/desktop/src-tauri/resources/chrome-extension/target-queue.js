const queues = new Map();

// Completion and tab navigation must wait for input/log reads on the same target.
export async function queueTarget(target, operation) {
  const key = target.tabId === undefined ? `worker:${target.targetId}` : `tab:${target.tabId}`;
  const previous = queues.get(key) ?? Promise.resolve();
  const current = previous.catch(() => {}).then(operation);
  queues.set(key, current);
  try { return await current; }
  finally { if (queues.get(key) === current) queues.delete(key); }
}
