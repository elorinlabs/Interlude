import { RemoteDesktopHostRegistry, type DesktopHostSessionFactory } from './hostRegistry';
import { HostSession } from './hostSession';

export type { DesktopHostSession } from './hostRegistry';

/** The GUI host may fall back to WebView capture; unattended services inject a native-only factory. */
export class RemoteDesktopHost extends RemoteDesktopHostRegistry {
  constructor(createSession: DesktopHostSessionFactory
    = (settings, ice, expiresAt, diagnostic) => new HostSession(settings, ice, expiresAt, diagnostic)) {
    super(createSession);
  }
}
