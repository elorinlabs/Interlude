/** Attempt every selected task; a failed removal must not prevent the remaining removals. */
export async function removeDownloads(ids: readonly string[], remove: (id: string) => Promise<unknown>) {
  const failed: string[] = [];
  for (const id of new Set(ids)) {
    try { await remove(id); }
    catch { failed.push(id); }
  }
  return failed;
}
