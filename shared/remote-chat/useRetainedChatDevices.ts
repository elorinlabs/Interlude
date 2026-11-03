import { useState } from 'react';

interface Device { deviceId: string }
interface RetainedDevices { scope: string; ids: string[] }

/** Retain visited chats until their device is removed or the signed-in account changes. */
export function useRetainedChatDevices<T extends Device>({ scope, devices, selectedId }: {
  scope: string; devices: T[]; selectedId?: string;
}): T[] {
  const [retained, setRetained] = useState<RetainedDevices>({ scope, ids: [] });
  const available = new Map(devices.map(device => [device.deviceId, device]));
  const ids = retained.scope === scope ? retained.ids.filter(id => available.has(id)) : [];
  if (selectedId && available.has(selectedId) && !ids.includes(selectedId)) ids.push(selectedId);
  if (retained.scope !== scope || ids.length !== retained.ids.length
    || ids.some((id, index) => id !== retained.ids[index])) {
    // Update during render so returning to a device never mounts a temporary replacement chat.
    setRetained({ scope, ids });
  }
  return ids.flatMap(id => {
    const device = available.get(id);
    return device ? [device] : [];
  });
}
