import type { ProjectFile, ProjectFilesResponse } from '../remote-chat/projectFiles';
import type { SshListDirectory } from './sshProjectClient';

const RESULT_LIMIT = 50;
const DIRECTORY_LIMIT = 128;
const SEARCH_TIME_MS = 4000;

/** Bound remote round trips, skip inaccessible children, and never follow directory aliases twice. */
export async function searchSshProject({ list, root, query }: {
  list: SshListDirectory; root: string; query: string;
}): Promise<ProjectFilesResponse> {
  const entries: ProjectFile[] = [];
  const pending = [root];
  const visited = new Set<string>();
  const term = query.toLocaleLowerCase();
  const started = Date.now();
  const prefix = `${root.replace(/\/+$/, '')}/`;
  let truncated = false;
  let scanned = 0;
  while (pending.length && scanned < DIRECTORY_LIMIT && Date.now() - started < SEARCH_TIME_MS) {
    const path = pending.shift()!;
    scanned++;
    const result = await list(path).catch(error => {
      if (path === root) throw error;
      truncated = true;
      return undefined;
    });
    if (!result || visited.has(result.path)) continue;
    visited.add(result.path);
    truncated ||= result.truncated;
    for (const entry of result.entries) {
      const relativePath = entry.path.startsWith(prefix) ? entry.path.slice(prefix.length) : entry.name;
      if (relativePath.toLocaleLowerCase().includes(term)) entries.push({ ...entry, relativePath });
      if (entry.directory && !visited.has(entry.path)) pending.push(entry.path);
      if (entries.length >= RESULT_LIMIT) return { directory: root, parent: null, entries, truncated: true };
    }
  }
  return { directory: root, parent: null, entries, truncated: truncated || pending.length > 0 };
}
