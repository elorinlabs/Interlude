import type { Item } from "./types";

export interface ModelChangeRecord { afterItemId: string | null; item: Item }

export function modelChangeRecords(items: Item[]): ModelChangeRecord[] {
  return items.flatMap((item, index) => item.type === "modelChange"
    ? [{ afterItemId: items[index - 1]?.id ?? null, item }] : []);
}

export function validModelChangeRecords(value: unknown): value is ModelChangeRecord[] {
  if (!Array.isArray(value)) return false;
  return value.every((entry: unknown) => {
    if (!entry || typeof entry !== "object") return false;
    const record = entry as Partial<ModelChangeRecord>;
    const item = record.item;
    return (record.afterItemId === null || typeof record.afterItemId === "string")
      && Boolean(item && item.type === "modelChange" && typeof item.id === "string"
        && typeof item.text === "string" && typeof item.success === "boolean"
        && Array.isArray(item.summary) && item.summary.every((text) => typeof text === "string"));
  });
}

/** Restore UI-only markers at their original position without sending them to the model. */
export function restoreModelChanges(items: Item[], records: ModelChangeRecord[] = []): Item[] {
  if (!records.length) return items;
  const restored = [...items];
  for (const { afterItemId, item } of records) {
    if (restored.some((entry) => entry.id === item.id)) continue;
    const anchor = afterItemId === null ? -1 : restored.findIndex((entry) => entry.id === afterItemId);
    if (afterItemId !== null && anchor === -1) continue;
    restored.splice(anchor + 1, 0, item);
  }
  return restored;
}
