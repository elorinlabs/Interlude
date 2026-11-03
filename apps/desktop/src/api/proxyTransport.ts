import { hasLocalBackend, invoke, loadAppSettings } from "./backend";

export interface ProxyTransportSettings {
  networkRetryCount: number;
  maxRedirects: number;
}

export const DEFAULT_PROXY_TRANSPORT: ProxyTransportSettings = { networkRetryCount: 6, maxRedirects: 10 };
export const MAX_PROXY_TRANSPORT_COUNT = 0xffff_ffff;
const PREVIEW_KEY = "codex-switch.proxy-transport";

export async function loadProxyTransport(): Promise<ProxyTransportSettings> {
  if (!hasLocalBackend) {
    const saved = window.localStorage.getItem(PREVIEW_KEY);
    return saved ? JSON.parse(saved) as ProxyTransportSettings : DEFAULT_PROXY_TRANSPORT;
  }
  return (await loadAppSettings()).proxyTransport ?? DEFAULT_PROXY_TRANSPORT;
}

export async function saveProxyTransport(settings: ProxyTransportSettings): Promise<ProxyTransportSettings> {
  if (!hasLocalBackend) {
    window.localStorage.setItem(PREVIEW_KEY, JSON.stringify(settings));
    return settings;
  }
  return invoke<ProxyTransportSettings>("set_proxy_transport", { settings });
}
