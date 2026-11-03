import { invoke } from '@tauri-apps/api/core';
import type { DesktopDisplays, DesktopSettings } from '../../../../shared/remote-desktop/protocol';

type OpenedDesktop = DesktopDisplays & { id: string; nativeOnly?: boolean };
/** Assigned by the authenticated host, never accepted from viewer settings. */
export interface DesktopCaptureSettings extends DesktopSettings { captureGroup?: string }

export async function openDesktopCapture(displayId?: string, expiresAt?: number,
  captureGroup?: string): Promise<OpenedDesktop> {
  const opened = await invoke<string | OpenedDesktop>('remote_desktop_open',
    { displayId, ...(expiresAt === undefined ? {} : { expiresAt }),
      ...(captureGroup === undefined ? {} : { captureGroup }) });
  // Keep the capture fallback usable with hosts that predate display discovery.
  return typeof opened === 'string' ? { id: opened } : opened;
}
