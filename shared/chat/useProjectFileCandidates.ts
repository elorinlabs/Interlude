import { useEffect, useRef, useState } from 'react';
import type { ProjectFile, ProjectFilesRequest, ProjectFilesResponse } from '../remote-chat/projectFiles';
import type { AttachmentReference } from '../../apps/desktop/src/pages/codexGui/attachmentTypes';

const SEARCH_DELAY_MS = 180;
export type ProjectFileSearch = (request: ProjectFilesRequest) => Promise<ProjectFilesResponse>;
interface Options {
  active: boolean; connected: boolean; query: string; cwd: string; threadId?: string | null;
  load: ProjectFileSearch;
}
const empty = { entries: [] as ProjectFile[], loading: false, error: '', truncated: false };

export function projectFileReference(file: ProjectFile): AttachmentReference {
  return { kind: file.directory ? 'folder' : 'file', name: file.name, path: file.path };
}

/** Debounce typing, serialize searches, and hide stale results as soon as their scope changes. */
export function useProjectFileCandidates({ active, connected, query, cwd, threadId, load }: Options) {
  const key = JSON.stringify([query, cwd, threadId, active, connected]);
  const [result, setResult] = useState({ ...empty, key: '', load });
  const pending = useRef<Promise<void> | null>(null);
  useEffect(() => {
    if (!active || !connected || (!cwd && !threadId)) return;
    let cancelled = false;
    setResult({ ...empty, loading: true, key, load });
    const search = async () => {
      await pending.current;
      if (cancelled) return;
      const request = async () => {
        try {
          const response = await load({ cwd: cwd || undefined, threadId: threadId || undefined, query });
          if (!cancelled) setResult({ ...empty, key, load, entries: response.entries, truncated: response.truncated });
        } catch {
          if (!cancelled) setResult({ ...empty, key, load, error: '文件搜索失败，请重新输入 % 重试。' });
        }
      };
      pending.current = request();
      await pending.current;
    };
    const timer = setTimeout(() => void search(), SEARCH_DELAY_MS);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [active, connected, query, cwd, threadId, load, key]);
  if (!active) return empty;
  if (!connected) return { ...empty, error: '连接后即可引用文件或文件夹' };
  if (!cwd && !threadId) return { ...empty, error: '请先选择项目文件夹' };
  return result.key === key && result.load === load ? result : { ...empty, loading: true };
}
