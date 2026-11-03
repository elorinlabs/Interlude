import type { Language } from "../localization/language";

export const COZE_DESKTOP_READY = "remoteai:coze:ready";
export const COZE_DESKTOP_STOP_READY = "remoteai:coze:stop-ready";
export const COZE_DESKTOP_STOP = "remoteai:coze:stop";
export const COZE_DESKTOP_STATE = "remoteai:coze:state";

export interface CozeDesktopState {
  type: typeof COZE_DESKTOP_STATE;
  busy: boolean;
  /** Desktop interface language. Optional: older desktop builds send only `type` and `busy`. */
  language?: Language;
}

export function isCozeDesktopState(value: unknown): value is CozeDesktopState {
  return typeof value === "object" && value !== null && "type" in value
    && value.type === COZE_DESKTOP_STATE && "busy" in value && typeof value.busy === "boolean";
}

/**
 * Adds the initial interface language to the editor URL fragment (`#token=…&lang=ru`).
 * The editor stores it on load; later switches arrive through `CozeDesktopState.language`,
 * so the frame never has to reload. Runtimes without localization ignore the parameter.
 */
export function withCozeLanguage(url: string, language: Language): string {
  const target = new URL(url);
  const fragment = new URLSearchParams(target.hash.slice(1));
  fragment.set("lang", language);
  target.hash = fragment.toString();
  return target.toString();
}
