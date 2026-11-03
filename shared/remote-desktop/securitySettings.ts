import type { useDesktopSession } from './useDesktopSession';
import type { SecuritySettingsProps } from './security';
import { desktopStatusAction } from './statusAction';

export function desktopSecuritySettings(session: ReturnType<typeof useDesktopSession>, close: () => void)
  : SecuritySettingsProps {
  const action = desktopStatusAction(session);
  return { connected: !!session.stream, control: session.capabilities.control !== false,
    supported: session.capabilities.security === true, value: session.security.value,
    saving: session.saving || session.security.saving, saved: session.security.saved,
    error: session.security.error, update: session.security.update,
    privacy: { available: session.capabilities.privacyScreen === true,
      enabled: session.privacyScreen, toggle: session.togglePrivacy },
    clipboard: { available: session.capabilities.clipboard === true, enabled: session.security.clipboardSync,
      toggle: session.security.toggleClipboardSync },
    notice: session.status ? { message: session.status, ...action } : undefined, close };
}
