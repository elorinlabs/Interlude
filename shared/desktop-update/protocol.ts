import canonicalCopy from '@interlude/i18n/copy/client/desktopUpdate';
export const DESKTOP_UPDATE_CAPABILITY = 'app-update';
export type UpdateAction = 'status' | 'check' | 'install';
export type UpdatePhase = 'idle' | 'checking' | 'available' | 'downloading' | 'installing' | 'error';
export interface DesktopUpdateStatus {
  currentVersion: string;
  latestVersion: string | null;
  notes: string | null;
  phase: UpdatePhase;
  progress: number | null;
  error: string | null;
}
export interface UpdateDevice {
  deviceId: string;
  name: string;
  platform: string;
  online: boolean;
  appVersion?: string | null;
  capabilities?: string[];
}
export const UPDATE_MESSAGES = canonicalCopy;

export function isUpdateBusy(status: DesktopUpdateStatus | null) {
  return !!status && ['checking', 'downloading', 'installing'].includes(status.phase);
}

export function parseUpdateStatus(value: unknown): DesktopUpdateStatus | null {
  if (!value || typeof value !== 'object') return null;
  const data = value as Partial<DesktopUpdateStatus>;
  if (typeof data.currentVersion !== 'string' || data.currentVersion.length > 80
    || !['idle', 'checking', 'available', 'downloading', 'installing', 'error'].includes(data.phase ?? '')
    || !(data.latestVersion === null || typeof data.latestVersion === 'string')
    || !(data.notes === null || typeof data.notes === 'string')
    || !(data.error === null || typeof data.error === 'string')
    || !(data.progress === null || (typeof data.progress === 'number'
      && Number.isFinite(data.progress) && data.progress >= 0 && data.progress <= 100))) return null;
  return data as DesktopUpdateStatus;
}
