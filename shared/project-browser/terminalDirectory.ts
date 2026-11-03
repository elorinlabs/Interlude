import type { ProjectFile } from '../remote-chat/projectFiles';

/** Preserve directory paths verbatim and retain the separator at a filesystem root. */
export function terminalDirectory(entry: ProjectFile): string {
  if (entry.directory) return entry.path;
  const separator = Math.max(entry.path.lastIndexOf('/'), entry.path.lastIndexOf('\\'));
  const root = separator === 0 || (separator === 2 && entry.path[1] === ':');
  return entry.path.slice(0, separator + (root ? 1 : 0));
}
