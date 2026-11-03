import type { EnabledLanguage } from '@interlude/i18n';

export interface GitChange {
  path: string; originalPath: string | null; status: string; conflict: boolean; version: string;
}
export interface GitChanges {
  root: string; branch: string | null; head: string | null; files: GitChange[];
  integration?: GitIntegration | null;
}
export interface GitIntegration { kind: 'merge' | 'rebase' | 'cherryPick' | 'revert'; version: string }
export interface GitConflict {
  path: string; version: string; base: string | null; ours: string | null; theirs: string | null;
  result: string | null; markerSize: number;
}
export interface GitResolution { cwd: string; path: string; version: string; content: string | null }
export interface GitDiff { text: string; truncated: boolean }
export interface GitCommitFile { path: string; originalPath: string | null; status: string }
export interface GitCommit {
  hash: string; parents: string[]; author: string; date: string; subject: string; refs: string[];
}
export interface GitHistory { commits: GitCommit[]; hasMore: boolean }
export interface GitCommitRequest {
  cwd: string; head: string | null; message: string; files: { path: string; version: string }[];
}
export interface GitMessageRequest extends Omit<GitCommitRequest, 'message'> {
  language: EnabledLanguage;
}
export interface GitSettings { autoMessage: boolean; revision: number }
export type GitFileAction = 'rollback' | 'delete';
export interface GitFileActionRequest extends Omit<GitCommitRequest, 'message'> {
  action: GitFileAction;
}
export interface GitFileActionPrompt extends Omit<GitCommitRequest, 'cwd' | 'message'> {
  action: GitFileAction | 'commit';
}
export interface GitBranch {
  name: string; ref: string; remote: boolean; occupied: boolean;
}
export interface GitRepository {
  branches: GitBranch[]; remotes: string[]; upstream: string | null; ahead: number; behind: number;
}
export type GitAction = 'switch' | 'fetch' | 'pull' | 'update' | 'push';
export type GitStrategy = 'merge' | 'rebase';
export interface GitActionRequest {
  cwd: string; action: GitAction; head: string | null; branch: string | null;
  target?: string; strategy?: GitStrategy;
}
export type GitResetMode = 'soft' | 'mixed' | 'hard' | 'keep';
export interface GitRevisionRequest {
  cwd: string; action: 'checkout' | 'reset'; commit: string; head: string | null; branch: string | null;
  files: { path: string; version: string }[]; mode?: GitResetMode;
}
export interface GitRevisionPrompt extends Omit<GitRevisionRequest, 'cwd' | 'mode'> { subject: string }
export interface GitClient {
  conflict: (cwd: string, path: string) => Promise<GitConflict>;
  resolveConflict: (request: GitResolution) => Promise<void>;
  continueIntegration: (cwd: string, version: string) => Promise<void>;
  settings: (autoMessage?: boolean) => Promise<GitSettings>;
  generateMessage: (request: GitMessageRequest) => Promise<{ message: string }>;
  revision: (request: GitRevisionRequest) => Promise<void>;
  repository: (cwd: string) => Promise<GitRepository>;
  action: (request: GitActionRequest) => Promise<void>;
  changes: (cwd: string) => Promise<GitChanges>;
  diff: (cwd: string, path: string, commit?: string) => Promise<GitDiff>;
  history: (cwd: string, skip: number) => Promise<GitHistory>;
  commitFiles: (cwd: string, commit: string) => Promise<GitCommitFile[]>;
  commit: (request: GitCommitRequest) => Promise<{ hash: string }>;
  fileAction: (request: GitFileActionRequest) => Promise<void>;
}
