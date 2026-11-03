function registryInValue(value, depth = 0) {
  if (!value || typeof value !== "object" || depth > 4) return null;
  if (typeof value.getImplForHostId === "function" && typeof value.addRegistryCallback === "function") return value;
  if (!Array.isArray(value)) return null;
  for (const item of value) {
    const found = registryInValue(item, depth + 1);
    if (found) return found;
  }
  return null;
}

function registryInFiber(fiber) {
  const candidates = [fiber.memoizedProps?.value, fiber.updateQueue?.memoCache?.data];
  let hook = fiber.memoizedState;
  for (let count = 0; hook && count < 100; count += 1, hook = hook.next) {
    candidates.push(hook.memoizedState);
  }
  return registryInValue(candidates);
}

async function findContextRegistry(isDisposed) {
  const root = window.__codexRoot?._internalRoot?.current;
  const queue = root ? [root] : [];
  for (let count = 0; queue.length && count < 10_000 && !isDisposed(); count += 1) {
    const fiber = queue.pop();
    const registry = registryInFiber(fiber);
    if (registry) return registry;
    if (fiber.sibling) queue.push(fiber.sibling);
    if (fiber.child) queue.push(fiber.child);
    if (count % 200 === 199) await new Promise(resolve => setTimeout(resolve, 0));
  }
  return null;
}
