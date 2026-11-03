import type { TerminalInfo, TerminalSize } from './types';

export interface SshEndpoint { host: string; port: number }
export interface SshRemote extends SshEndpoint { username: string }
export interface SshX11 { display?: string }
export interface SshConnect {
  endpoint: SshEndpoint; username: string; fingerprint: string; size: TerminalSize;
  password?: string; privateKey?: string; passphrase?: string;
  x11?: SshX11;
}
export interface SshEntry { name: string; path: string; directory: boolean; size: number }
export type SshUploadMode = 'reject' | 'overwrite' | 'rename';
export type SshFileAction = { type: 'list' | 'read' | 'createFolder' | 'createFile' | 'delete' | 'deleteTree'; path: string }
  | { type: 'rename'; path: string; destination: string }
  | { type: 'upload'; path: string; data: string }
  | { type: 'readChunk'; path: string; offset: number; length: number }
  | { type: 'uploadStart'; path: string; size: number; mode: SshUploadMode }
  | { type: 'uploadChunk'; token: string; offset: number; data: string }
  | { type: 'uploadFinish' | 'uploadCancel'; token: string };
export type SshFileReply = { type: 'list'; path: string; entries: SshEntry[]; truncated: boolean }
  | { type: 'file'; data: string } | { type: 'done' }
  | { type: 'upload'; token: string } | { type: 'uploaded'; path: string };
export interface SshApi {
  profiles: import('./sshProfiles').SshProfileStore;
  probe: (endpoint: SshEndpoint) => Promise<string>;
  ensureX11?: (options: SshX11) => Promise<void>;
  open: (request: SshConnect, projectCwd: string) => Promise<TerminalInfo>;
  files: (id: string, request: SshFileAction) => Promise<SshFileReply>;
}
export const SSH_FILE_LIMIT = 5 * 1024 * 1024;

/** Keep error keys intact until rendering so open views follow language changes. */
export const sshError = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : typeof error === 'string' ? error : fallback;
