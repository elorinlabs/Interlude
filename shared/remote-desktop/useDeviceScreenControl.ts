import { useEffect, useRef } from 'react';
import { supportsScreenControl } from './screenControl';

const FAILURE = 'client.deviceScreen.failed';
const REQUEST_TIMEOUT_MS = 35_000;
const ERRORS = [FAILURE, 'client.deviceScreen.updateRequired', 'client.deviceScreen.openComputerApp'] as const;
type Notice = typeof ERRORS[number] | 'client.deviceScreen.changing'
  | 'client.deviceScreen.offSent' | 'client.deviceScreen.onSent';
interface Device { deviceId: string; platform: string; online: boolean }
interface Options {
  scope: string;
  request: (path: string, init: RequestInit) => Promise<unknown>;
  notify: (message: Notice, failed: boolean) => void;
}

/** Device commands never select a chat device or launch a remote desktop session. */
export function useDeviceScreenControl({ scope, request, notify }: Options) {
  const pending = useRef<AbortController>();
  useEffect(() => () => { pending.current?.abort(); pending.current = undefined; }, [scope]);
  return async (device: Device, enabled: boolean) => {
    if (!device.online || !supportsScreenControl(device)) return;
    if (pending.current) { notify('client.deviceScreen.changing', false); return; }
    const controller = new AbortController();
    pending.current = controller;
    notify('client.deviceScreen.changing', false);
    const timeout = setTimeout(() => {
      if (controller.signal.aborted) return;
      controller.abort();
      if (pending.current === controller) { pending.current = undefined; notify(FAILURE, true); }
    }, REQUEST_TIMEOUT_MS);
    controller.signal.addEventListener('abort', () => clearTimeout(timeout), { once: true });
    try {
      await request(`/devices/${encodeURIComponent(device.deviceId)}/screen-power`, {
        method: 'POST', signal: controller.signal, body: JSON.stringify({ action: enabled ? 'off' : 'on' }),
      });
      if (!controller.signal.aborted) notify(enabled ? 'client.deviceScreen.offSent' : 'client.deviceScreen.onSent', false);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (!controller.signal.aborted) notify(ERRORS.find(key => key === message) ?? FAILURE, true);
    } finally {
      clearTimeout(timeout);
      if (pending.current === controller) pending.current = undefined;
    }
  };
}
