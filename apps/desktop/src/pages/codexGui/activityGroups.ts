import type { Item } from "./types";

/** Keep explanations and reasoning in place while consecutive tool operations share one disclosure. */
export function groupConsecutiveActivities(items: Item[]) {
  const groups: { key: string; items: Item[]; activity: boolean }[] = [];
  for (const item of items) {
    const activity = !["userMessage", "agentMessage", "reasoning"].includes(item.type);
    const previous = groups.at(-1);
    if (activity && previous?.activity) previous.items.push(item);
    else groups.push({ key: item.id, items: [item], activity });
  }
  return groups;
}

/** A later completed operation must not conceal another operation that is still running. */
export function latestActivity(items: Item[]): Item | undefined {
  for (let index = items.length - 1; index >= 0; index--) {
    if (items[index].status === "inProgress") return items[index];
  }
  return items.at(-1);
}
