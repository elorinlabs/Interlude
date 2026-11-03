import { hasLocalBackend, invoke, loadAppSettings } from "./backend";

export interface ResponseHeaderTimeoutSettings {
  timeoutSeconds: number;
}

export const DEFAULT_RESPONSE_HEADER_TIMEOUT: ResponseHeaderTimeoutSettings = { timeoutSeconds: 600 };
export const MAX_RESPONSE_HEADER_TIMEOUT_SECONDS = 3_600;
const PREVIEW_KEY = "codex-switch.response-header-timeout";

export async function loadResponseHeaderTimeout(): Promise<ResponseHeaderTimeoutSettings> {
  if (!hasLocalBackend) {
    const saved = window.localStorage.getItem(PREVIEW_KEY);
    return saved ? JSON.parse(saved) as ResponseHeaderTimeoutSettings : DEFAULT_RESPONSE_HEADER_TIMEOUT;
  }
  return (await loadAppSettings()).responseHeaderTimeout ?? DEFAULT_RESPONSE_HEADER_TIMEOUT;
}

export async function saveResponseHeaderTimeout(
  settings: ResponseHeaderTimeoutSettings,
): Promise<ResponseHeaderTimeoutSettings> {
  if (!hasLocalBackend) {
    window.localStorage.setItem(PREVIEW_KEY, JSON.stringify(settings));
    return settings;
  }
  return invoke<ResponseHeaderTimeoutSettings>("set_response_header_timeout", { settings });
}
