import { createContext, type ReactNode } from 'react';
import type { fileApi } from './fileApi';
import type { filePreviewApi } from './filePreview/api';

/** A remote subtree must supply all operations; failures must never fall back to local IPC. */
export interface FileEnvironment {
  remote: true;
  actions: typeof fileApi;
  previews: typeof filePreviewApi;
  resolveWebsite: (url: string) => Promise<string>;
  image: (props: { src?: string; alt?: string; title?: string; compact?: boolean }) => ReactNode;
}
export const FileEnvironmentContext = createContext<FileEnvironment | null>(null);
