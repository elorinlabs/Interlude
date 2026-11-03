import type { DownloadClient, DownloadLocation } from '../../../../shared/remote-chat/downloads';
import type { FileClient } from '../../../../shared/remote-chat/fileDownload';
import type { ConnectionMode } from '../../../../shared/remote-chat/protocol';

export interface DownloadSource extends DownloadLocation {
  owner: string; deviceId: string; deviceName: string; path: string;
  preview?: import('../../../../shared/remote-chat/downloads').PreviewKind;
  gitCommit?: string;
  sshSessionId?: string;
}
export interface DownloadTask {
  id: string; source: DownloadSource; name: string;
  status: 'queued' | 'preparing' | 'downloading' | 'verifying' | 'ready' | 'saving'
    | 'paused' | 'completed' | 'failed';
  received: number; size: number; createdAt: number; completedAt?: number; message: string;
  revision?: string; mimeType?: string; bytesPerSecond?: number;
  protocol?: 'bulk' | 'legacy';
  manifest?: import('../../../../shared/remote-chat/downloadManifest').DownloadManifest;
  checkpoint?: import('../../../../shared/remote-chat/downloadManifest').DownloadCheckpoint;
  verified?: boolean;
  exported?: boolean;
  preparation?: import('../../../../shared/remote-chat/archiveDownload').ArchiveProgress;
}
export interface DownloadConnection {
  owner: string; deviceId: string; deviceName: string; ready: boolean; mode: ConnectionMode;
  threadId?: string; cwd?: string; client: DownloadClient; files: FileClient;
  git?: import('../../../../shared/remote-chat/gitTypes').GitClient;
  projectBrowser?: import('../../../../shared/project-browser/protocol').ProjectBrowserClient;
  ssh?: import('../../../../shared/terminal/ssh').SshApi;
}
