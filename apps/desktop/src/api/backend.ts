import type { AccountHealth } from '../types';
import { invoke as invokeTauri } from "@tauri-apps/api/core";
import { hasDirectChatInput } from "../../../../shared/remote-chat/uploadMode";
import { emit, listen, type UnlistenFn } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { chooseBrowserAccountFile } from "./browserAccountImport";
import { DEMO_ACCOUNTS, DEMO_INFO } from "../demo";
import { LANGUAGE_STORAGE_KEY, isLanguage, type Language } from "../i18n";
import { ANTIGRAVITY_FALLBACK_MODELS } from "../utils/antigravityProvider";
import { loadStoredModelTokenCosts } from "../pages/providers/providerUtils";
import type { AccountQuotaHistory, DailyTokenUsageBreakdown } from "../types/tokenUsageAnalytics";
import { previewAccountQuotaHistory, previewTokenBreakdown } from "./tokenUsagePreview";
import { previewHasLocalProxyLanApiKey } from "./localProxyLanKeysPreview";
import { normalizeThirdPartyAppWriteSettings, THIRD_PARTY_APP_IDS } from "../utils/thirdPartyApps";
import type { Account, AppInfo, AppSettings, BubbleStyle, CloudAuthState, ClaudeCodeWriteTarget, ThirdPartyAppWriteSettings, DailyTokenUsage, LoginStart, LoginStatus, LocalProxyStatus, SystemPromptRule, Provider, ProviderBalance, ProviderBalancePlatform, ReasoningEffort, TokenUsageEntry } from "../types";
import { DEFAULT_THEME_COLOR, normalizeThemeColor } from "../utils/theme";
export const isDesktopApp = "__TAURI_INTERNALS__" in window;

export const isHostedWebApp = document
  .querySelector('meta[name="codex-switch-runtime"]')
  ?.getAttribute("content") === "hosted";

export const hasLocalBackend = isDesktopApp || isHostedWebApp;


interface HostedInvokeResponse<T> {
  ok: boolean;
  result?: T;
  error?: string;
}


const HOSTED_WEB_API_KEY_STORAGE_KEY = "codex-switch:hosted-web-api-key";


function readHostedWebApiKey() {
  try {
    return window.sessionStorage.getItem(HOSTED_WEB_API_KEY_STORAGE_KEY) || "";
  } catch {
    return "";
  }
}


function writeHostedWebApiKey(value: string) {
  try {
    if (value) window.sessionStorage.setItem(HOSTED_WEB_API_KEY_STORAGE_KEY, value);
    else window.sessionStorage.removeItem(HOSTED_WEB_API_KEY_STORAGE_KEY);
  } catch {
    // Private browsing may disable session storage; the key remains in memory
    // for the current request flow instead.
  }
}


export interface HostedWebApiKeyRequest {
  resolve: (value: string | null) => void;
}


const hostedWebApiKeyRequestListeners = new Set<(request: HostedWebApiKeyRequest) => void>();

let pendingHostedWebApiKeyRequest: HostedWebApiKeyRequest | null = null;


let hostedWebApiKeyPrompt: Promise<string | null> | null = null;

let hostedWebApiKeyRejected = false;


function requestHostedWebApiKey() {
  if (!hostedWebApiKeyPrompt) {
    let resolvePrompt: (value: string | null) => void = () => undefined;
    const request: HostedWebApiKeyRequest = {
      resolve: (value) => {
        if (pendingHostedWebApiKeyRequest === request) pendingHostedWebApiKeyRequest = null;
        resolvePrompt(value);
      },
    };
    hostedWebApiKeyPrompt = new Promise<string | null>((resolve) => {
      resolvePrompt = resolve;
      pendingHostedWebApiKeyRequest = request;
      hostedWebApiKeyRequestListeners.forEach((listener) => listener(request));
    }).finally(() => {
      hostedWebApiKeyPrompt = null;
    });
  }
  return hostedWebApiKeyPrompt;
}


export async function invoke<T = void>(command: string, args: Record<string, unknown> = {}): Promise<T> {
  if (isDesktopApp) return invokeTauri<T>(command, args);
  if (!isHostedWebApp) throw new Error(`Native command is unavailable in browser preview: ${command}`);

  const body = JSON.stringify({ command, args });
  const request = (apiKey: string) => fetch("/__codex_switch__/api/invoke", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(command === 'codex_gui_request' && hasDirectChatInput(args.request)
        ? { "X-Codex-Chat-Transfer": "direct" } : {}),
      ...(apiKey ? { "X-API-Key": apiKey } : {}),
    },
    cache: "no-store",
    body,
  });
  let response = await request(readHostedWebApiKey());
  if (response.status === 401) {
    if (hostedWebApiKeyRejected) {
      throw new Error("The LAN access key was rejected. Check the key in Interlude and reload the page.");
    }
    writeHostedWebApiKey("");
    const suppliedKey = (await requestHostedWebApiKey())?.trim() || "";
    if (suppliedKey) {
      writeHostedWebApiKey(suppliedKey);
      response = await request(suppliedKey);
      if (response.status === 401) {
        writeHostedWebApiKey("");
        hostedWebApiKeyRejected = true;
      } else {
        hostedWebApiKeyRejected = false;
      }
    } else {
      hostedWebApiKeyRejected = true;
    }
  }
  if (!response.ok) {
    throw new Error((await response.text().catch(() => "")) || `Web command failed with HTTP ${response.status}`);
  }
  const payload = await response.json() as HostedInvokeResponse<T>;
  if (!payload.ok) throw new Error(payload.error || `Web command failed: ${command}`);
  return payload.result as T;
}


export function decodeTotpQrImage(dataBase64: string) {
  return invoke<string>("decode_totp_qr_image", { input: { dataBase64 } });
}

export const DEFAULT_CLOUD_BASE_URL = "https://codex.onepiper.cloud";

export const DEFAULT_AUTO_DISABLE_STATUS_CODES = [401, 402, 403, 429] as const;

export const DEFAULT_UPSTREAM_429_RETRY_TIMEOUT_SECONDS = 60;

export const MIN_UPSTREAM_429_RETRY_TIMEOUT_SECONDS = 1;

export const MAX_UPSTREAM_429_RETRY_TIMEOUT_SECONDS = 3_600;

export const DEFAULT_GPT_5_6_SOL_CONTEXT_WINDOW = 272_000;

export const MAX_GPT_5_6_SOL_CONTEXT_WINDOW = 1_050_000;

export const MIN_GPT_5_6_SOL_CONTEXT_WINDOW = 1_000;

const LAUNCH_AT_STARTUP_PREVIEW_KEY = "codex-switch:launch-at-startup";

const CLOSE_TO_TRAY_PREVIEW_KEY = "codex-switch:close-to-tray";

const NON_PROXY_ENHANCEMENTS_PREVIEW_KEY = "codex-switch:non-proxy-enhancements";

const FLOATING_BUBBLE_PREVIEW_KEY = "codex-switch:floating-bubble";

const PRIVACY_MODE_PREVIEW_KEY = "codex-switch:privacy-mode";

const HIDE_ACCOUNT_NOTES_PREVIEW_KEY = "codex-switch:hide-account-notes";

const BUBBLE_RESET_DISPLAY_PREVIEW_KEY = "codex-switch:bubble-reset-display";

const BUBBLE_STYLE_PREVIEW_KEY = "codex-switch:bubble-style";

const THEME_COLOR_PREVIEW_KEY = "codex-switch:theme-color";

const PROVIDER_GROUPS_PREVIEW_KEY = "codex-switch:provider-groups";

const ACCOUNT_GROUPS_PREVIEW_KEY = "codex-switch:account-groups";

const ACCOUNT_GROUP_ASSIGNMENTS_KEY = "codex-switch:account-group-assignments";

const ACTIVE_GROUP_PREVIEW_KEY = "codex-switch:active-group";


function readPreviewAccounts(): Account[] {
  let groups: Record<string, unknown> = {};
  try {
    groups = JSON.parse(window.localStorage.getItem(ACCOUNT_GROUP_ASSIGNMENTS_KEY) ?? "{}") ?? {};
  } catch { /* Invalid preview metadata falls back to the demo accounts. */ }
  return structuredClone(DEMO_ACCOUNTS).map(account => {
    const group = groups[account.id];
    return { ...account, group: typeof group === "string" ? group : account.group };
  });
}

const CLAUDE_CODE_WRITE_TARGET_PREVIEW_KEY = "codex-switch:claude-code-write-target";

const THIRD_PARTY_APP_WRITE_PREVIEW_KEY = "codex-switch:third-party-app-write";

const CLOUD_BASE_URL_PREVIEW_KEY = "codex-switch:cloud-base-url";

const NETWORK_PROXY_ENABLED_PREVIEW_KEY = "codex-switch:network-proxy-enabled";

const NETWORK_PROXY_URL_PREVIEW_KEY = "codex-switch:network-proxy-url";

const NETWORK_PROXY_PORT_PREVIEW_KEY = "codex-switch:network-proxy-port";

const CLOUD_USER_PREVIEW_KEY = "codex-switch:cloud-user-email";

const PROVIDERS_PREVIEW_KEY = "codex-switch:providers";

const DEFAULT_OPENAI_PROVIDER_MODEL = "gpt-6-astra";

const LOCAL_PROXY_PREVIEW_KEY = "codex-switch:local-proxy-running";

const LOCAL_PROXY_FAST_MODE_PREVIEW_KEY = "codex-switch:local-proxy-fast-mode";

const LOCAL_PROXY_SERVICE_TIER_PREVIEW_KEY = "codex-switch:local-proxy-service-tier";

const LOCAL_PROXY_AUTO_SWITCH_PREVIEW_KEY = "codex-switch:local-proxy-auto-switch";

const LOCAL_PROXY_CONCURRENT_ROUTING_PREVIEW_KEY = "codex-switch:local-proxy-concurrent-routing";

const LOCAL_PROXY_CONCURRENT_GROUP_PREVIEW_KEY = "codex-switch:local-proxy-concurrent-group";

const LOCAL_PROXY_CUSTOM_PRIORITY_PREVIEW_KEY = "codex-switch:local-proxy-custom-priority";

const LOCAL_PROXY_CUSTOM_THRESHOLD_PREVIEW_KEY = "codex-switch:local-proxy-custom-threshold";

const LOCAL_PROXY_GLOBAL_THRESHOLD_PREVIEW_KEY = "codex-switch:local-proxy-global-threshold";

const LOCAL_PROXY_AUTO_DISABLE_UNREACHABLE_PREVIEW_KEY = "codex-switch:local-proxy-auto-disable-unreachable";

const SYSTEM_PROMPT_FILTER_PREVIEW_KEY = "codex-switch:system-prompt-filter";

const SYSTEM_PROMPT_FILTER_RULES_PREVIEW_KEY = "codex-switch:system-prompt-filter-rules";

const SYSTEM_PROMPT_INJECTION_PREVIEW_KEY = "codex-switch:system-prompt-injection";

const SYSTEM_PROMPT_INJECTION_PROMPTS_PREVIEW_KEY = "codex-switch:system-prompt-injection-prompts";

const LOCAL_PROXY_LISTEN_ALL_INTERFACES_PREVIEW_KEY = "codex-switch:local-proxy-listen-all-interfaces";

const LOCAL_PROXY_PORT_PREVIEW_KEY = "codex-switch:local-proxy-port";

const WEB_PROXY_LISTEN_ALL_INTERFACES_PREVIEW_KEY = "codex-switch:web-proxy-listen-all-interfaces";

const LOCAL_PROXY_IMAGE_ACCOUNT_PREVIEW_KEY = "codex-switch:image-generation-account";

const LOCAL_PROXY_IMAGE_INPUT_TARGET_PREVIEW_KEY = "codex-switch:image-input-target";

const LOCAL_PROXY_IMAGE_OUTPUT_TARGET_PREVIEW_KEY = "codex-switch:image-output-target";

const LOCAL_PROXY_OPENAI_AUTH_ACCOUNT_PREVIEW_KEY = "codex-switch:proxy-openai-auth-account";

const TOKEN_USAGE_WEEKS_PREVIEW_KEY = "codex-switch:token-usage-weeks";

const TOKEN_USAGE_REFRESH_PREVIEW_KEY = "codex-switch:token-usage-refresh-seconds";

const CODEX_USAGE_SUMMARY_PREVIEW_KEY = "codex-switch:codex-usage-summary";

const AUTO_DISABLE_STATUS_CODES_PREVIEW_KEY = "codex-switch:auto-disable-status-codes";

const UPSTREAM_429_RETRY_TIMEOUT_PREVIEW_KEY = "codex-switch:upstream-429-retry-timeout";

const SHOW_USAGE_NETWORK_ERRORS_PREVIEW_KEY = "codex-switch:show-usage-network-errors";

const GPT_5_6_SOL_CONTEXT_WINDOW_LEGACY_KEY = "codex-switch:account-table-model-context-window";

const LANGUAGE_EVENT = "codex-switch:language-changed";

const PROVIDERS_EVENT = "codex-switch:providers-changed";

const PROVIDER_BALANCE_EVENT = "codex-switch:provider-balance-refreshed";

const providerBalanceRequests = new Map<string, Promise<ProviderBalance>>();


interface ProviderBalanceEventDetail {
  id: string;
  balance: ProviderBalance;
}


function previewCloudState(): CloudAuthState {
  const storedBaseUrl = window.localStorage.getItem(CLOUD_BASE_URL_PREVIEW_KEY);
  const baseUrl = (storedBaseUrl ?? DEFAULT_CLOUD_BASE_URL).trim();
  const userEmail = window.localStorage.getItem(CLOUD_USER_PREVIEW_KEY);
  return {
    enabled: baseUrl.length > 0,
    baseUrl: baseUrl || null,
    authenticated: Boolean(baseUrl && userEmail),
    userEmail,
    userId: userEmail ? "preview" : null,
    lastSyncAt: null,
    sessionExpired: false,
  };
}


function normalizeModels(model: string, models: unknown): string[] {
  const normalized: string[] = [];
  const push = (value: unknown) => {
    if (typeof value !== "string") return;
    const trimmed = value.trim();
    if (trimmed && !normalized.includes(trimmed)) normalized.push(trimmed);
  };
  push(model);
  if (Array.isArray(models)) models.forEach(push);
  return normalized;
}


function normalizeModelSubset(models: string[], selected: unknown): string[] {
  if (!Array.isArray(selected)) return [];
  return normalizeModels("", selected).filter((model) => models.includes(model));
}


const REASONING_EFFORTS = new Set(["none", "low", "medium", "high", "xhigh", "max", "ultra"]);


function normalizeModelReasoningEfforts(models: string[], value: unknown): Provider["modelReasoningEfforts"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const normalized: Provider["modelReasoningEfforts"] = {};
  for (const model of models) {
    const efforts = (value as Record<string, unknown>)[model];
    if (!Array.isArray(efforts)) continue;
    const valid = [...new Set(efforts.filter((effort): effort is ReasoningEffort => (
      typeof effort === "string" && REASONING_EFFORTS.has(effort)
    )))];
    if (valid.length) normalized[model] = valid;
  }
  return normalized;
}


function normalizeModelContextWindows(models: string[], value: unknown): Provider["modelContextWindows"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const normalized: Provider["modelContextWindows"] = {};
  for (const model of models) {
    const contextWindow = (value as Record<string, unknown>)[model];
    if (typeof contextWindow === "number" && Number.isSafeInteger(contextWindow) && contextWindow > 0) {
      normalized[model] = contextWindow;
    }
  }
  return normalized;
}


function normalizeModelApiFormats(models: string[], value: unknown): Provider["modelApiFormats"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const normalized: Provider["modelApiFormats"] = {};
  for (const model of models) {
    const apiFormat = (value as Record<string, unknown>)[model];
    if (apiFormat === "openaiResponses" || apiFormat === "openaiChat"
      || apiFormat === "anthropicMessages" || apiFormat === "geminiGenerateContent") {
      normalized[model] = apiFormat;
    }
  }
  return normalized;
}


function readPreviewProviders(): Provider[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(PROVIDERS_PREVIEW_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((provider): provider is Provider & { models?: unknown } => Boolean(
      provider
      && typeof provider === "object"
      && "id" in provider
      && "name" in provider
      && "baseUrl" in provider
      && "model" in provider,
    )).map((provider) => {
      const kind = provider.kind === "openai" ? "openai" : "custom";
      const storedModel = provider.model.trim();
      const selectedModel = kind === "openai" && !storedModel
        ? DEFAULT_OPENAI_PROVIDER_MODEL
        : storedModel;
      const models = normalizeModels(selectedModel, provider.models);
      return {
        ...provider,
        modelTokenCosts: provider.modelTokenCosts ?? loadStoredModelTokenCosts()[provider.id] ?? {},
        kind,
        group: kind === "custom" && typeof provider.group === "string" ? provider.group.trim() : "",
        model: models.includes(selectedModel) ? selectedModel : (models[0] ?? ""),
        models,
        modelReasoningEfforts: normalizeModelReasoningEfforts(models, provider.modelReasoningEfforts),
        modelContextWindows: normalizeModelContextWindows(models, provider.modelContextWindows),
        modelApiFormats: normalizeModelApiFormats(models, provider.modelApiFormats),
        imageInputModels: normalizeModelSubset(models, provider.imageInputModels),
        imageInputModelsConfigured: Boolean(provider.imageInputModelsConfigured),
        contextWindow: provider.contextWindow ?? null,
        modelSelectionControlledByCodex: kind === "openai"
          ? true
          : Boolean(provider.modelSelectionControlledByCodex),
        apiFormat: kind === "openai" ? "openaiResponses" : provider.apiFormat,
        autoSwitchEnabled: kind === "custom" && Boolean(provider.autoSwitchEnabled),
        balancePlatform: provider.balancePlatform ?? null,
        balanceQueryUrl: provider.balanceQueryUrl ?? null,
        balanceQueryUsesApiKey: provider.balanceQueryUsesApiKey !== false,
        hasBalanceQueryToken: Boolean(provider.hasBalanceQueryToken),
        walletQueryUrl: provider.walletQueryUrl ?? null,
        hasWalletQueryToken: Boolean(provider.hasWalletQueryToken),
        walletUsername: provider.walletUsername ?? null,
        hasWalletLoginCredentials: Boolean(provider.hasWalletLoginCredentials),
      };
    });
  } catch {
    return [];
  }
}


function writePreviewProviders(providers: Provider[]) {
  window.localStorage.setItem(PROVIDERS_PREVIEW_KEY, JSON.stringify(providers));
  window.dispatchEvent(new CustomEvent(PROVIDERS_EVENT));
}


function previewLocalProxyStatus(): LocalProxyStatus {
  const configuredPort = Number(window.localStorage.getItem(LOCAL_PROXY_PORT_PREVIEW_KEY));
  const configuredGlobalThreshold = Number(
    window.localStorage.getItem(LOCAL_PROXY_GLOBAL_THRESHOLD_PREVIEW_KEY),
  );
  const port = Number.isInteger(configuredPort) && configuredPort >= 1 && configuredPort <= 65_535
    ? configuredPort
    : 0;
  const running = port > 0 && window.localStorage.getItem(LOCAL_PROXY_PREVIEW_KEY) === "true";
  const storedTier = window.localStorage.getItem(LOCAL_PROXY_SERVICE_TIER_PREVIEW_KEY);
  const savedTier = storedTier === "ultrafast" || storedTier === "priority" ? storedTier : "default";
  const legacyTier = window.localStorage.getItem(LOCAL_PROXY_FAST_MODE_PREVIEW_KEY) === "true"
    ? "priority" : "default";
  const serviceTier = running ? (storedTier === null ? legacyTier : savedTier) : "default";
  return {
    activeProviderGroup: window.localStorage.getItem(ACTIVE_GROUP_PREVIEW_KEY),
    running,
    serviceTier,
    fastModeEnabled: serviceTier !== "default",
    fastModeAvailable: port > 0 && window.localStorage.getItem(LOCAL_PROXY_PREVIEW_KEY) === "true",
    address: window.localStorage.getItem(LOCAL_PROXY_LISTEN_ALL_INTERFACES_PREVIEW_KEY) === "true" ? "0.0.0.0" : "127.0.0.1",
    port,
    baseUrl: port > 0 ? `http://127.0.0.1:${port}/v1` : "",
    autoSwitchOnQuotaExhaustion: window.localStorage.getItem(LOCAL_PROXY_AUTO_SWITCH_PREVIEW_KEY) === "true",
    concurrentAccountRoutingEnabled: window.localStorage.getItem(LOCAL_PROXY_CONCURRENT_ROUTING_PREVIEW_KEY) === "true",
    concurrentAccountGroup: window.localStorage.getItem(LOCAL_PROXY_CONCURRENT_GROUP_PREVIEW_KEY),
    customAutoSwitchPriorityEnabled: window.localStorage.getItem(LOCAL_PROXY_CUSTOM_PRIORITY_PREVIEW_KEY) === "true",
    customAutoSwitchThresholdEnabled: window.localStorage.getItem(LOCAL_PROXY_CUSTOM_THRESHOLD_PREVIEW_KEY) === "true",
    globalAutoSwitchThreshold: Number.isFinite(configuredGlobalThreshold)
      && configuredGlobalThreshold >= 0 && configuredGlobalThreshold <= 100
      ? configuredGlobalThreshold : 0,
    autoDisableUnreachableAccounts: window.localStorage.getItem(LOCAL_PROXY_AUTO_DISABLE_UNREACHABLE_PREVIEW_KEY) === "true",
    systemPromptFilterEnabled: window.localStorage.getItem(SYSTEM_PROMPT_FILTER_PREVIEW_KEY) === "true",
    systemPromptFilterRules: readPreviewSystemPromptFilterRules(),
    systemPromptInjectionEnabled: window.localStorage.getItem(SYSTEM_PROMPT_INJECTION_PREVIEW_KEY) === "true",
    systemPromptInjectionPrompts: readPreviewSystemPromptInjectionPrompts(),
    listenOnAllInterfaces: window.localStorage.getItem(LOCAL_PROXY_LISTEN_ALL_INTERFACES_PREVIEW_KEY) === "true",
    hasLanApiKey: previewHasLocalProxyLanApiKey(),
    imageGenerationAccountId: window.localStorage.getItem(LOCAL_PROXY_IMAGE_ACCOUNT_PREVIEW_KEY),
    imageInputTarget: readPreviewImageModelTarget(LOCAL_PROXY_IMAGE_INPUT_TARGET_PREVIEW_KEY),
    imageOutputTarget: readPreviewImageModelTarget(LOCAL_PROXY_IMAGE_OUTPUT_TARGET_PREVIEW_KEY),
    openaiAuthAccountId: window.localStorage.getItem(LOCAL_PROXY_OPENAI_AUTH_ACCOUNT_PREVIEW_KEY),
  };
}


function readPreviewImageModelTarget(key: string): LocalProxyStatus["imageInputTarget"] {
  const stored = window.localStorage.getItem(key);
  if (!stored) return null;
  try {
    const value = JSON.parse(stored) as unknown;
    if (!value || typeof value !== "object" || !("kind" in value)) return null;
    if (value.kind === "official" && "accountId" in value && typeof value.accountId === "string") {
      return { kind: "official", accountId: value.accountId };
    }
    if (value.kind === "provider" && "providerId" in value && "model" in value
      && typeof value.providerId === "string" && typeof value.model === "string") {
      return { kind: "provider", providerId: value.providerId, model: value.model };
    }
  } catch {
    return null;
  }
  return null;
}


export async function loadDashboard(): Promise<{ accounts: Account[]; info: AppInfo }> {
  if (!hasLocalBackend) {
    return { accounts: readPreviewAccounts(), info: DEMO_INFO };
  }
  const [accounts, info] = await Promise.all([
    invoke<Account[]>("list_accounts"),
    invoke<AppInfo>("get_app_info"),
  ]);
  return { accounts, info };
}


function previewFloatingBubbleEnabled() {
  return window.localStorage.getItem(FLOATING_BUBBLE_PREVIEW_KEY) !== "false";
}


function previewBubbleStyle(): BubbleStyle {
  return window.localStorage.getItem(BUBBLE_STYLE_PREVIEW_KEY) === "glass" ? "glass" : "classic";
}


function previewAutoDisableStatusCodes() {
  const saved = window.localStorage.getItem(AUTO_DISABLE_STATUS_CODES_PREVIEW_KEY);
  if (saved === null) return [...DEFAULT_AUTO_DISABLE_STATUS_CODES];
  try {
    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed)) return [...DEFAULT_AUTO_DISABLE_STATUS_CODES];
    return [...new Set(parsed.filter((status): status is number => (
      Number.isInteger(status) && status >= 100 && status <= 599
    )))].sort((left, right) => left - right);
  } catch {
    return [...DEFAULT_AUTO_DISABLE_STATUS_CODES];
  }
}


function previewUpstream429RetryTimeoutSeconds() {
  const value = Number(window.localStorage.getItem(UPSTREAM_429_RETRY_TIMEOUT_PREVIEW_KEY));
  return Number.isInteger(value)
    && value >= MIN_UPSTREAM_429_RETRY_TIMEOUT_SECONDS
    && value <= MAX_UPSTREAM_429_RETRY_TIMEOUT_SECONDS
    ? value
    : DEFAULT_UPSTREAM_429_RETRY_TIMEOUT_SECONDS;
}


function legacyGpt56SolContextWindow(): number | null {
  try {
    const contextWindowK = Number(window.localStorage.getItem(GPT_5_6_SOL_CONTEXT_WINDOW_LEGACY_KEY));
    const contextWindow = contextWindowK * 1_000;
    if (contextWindow === 256_000) return DEFAULT_GPT_5_6_SOL_CONTEXT_WINDOW;
    return Number.isSafeInteger(contextWindow)
      && contextWindow >= MIN_GPT_5_6_SOL_CONTEXT_WINDOW
      && contextWindow <= MAX_GPT_5_6_SOL_CONTEXT_WINDOW
      ? contextWindow
      : null;
  } catch {
    return null;
  }
}


export async function loadAppSettings(): Promise<AppSettings> {
  if (!hasLocalBackend) {
    return {
      codexHome: null,
      codexHomes: [],
      launchAtStartup: window.localStorage.getItem(LAUNCH_AT_STARTUP_PREVIEW_KEY) !== "false",
      closeToTray: window.localStorage.getItem(CLOSE_TO_TRAY_PREVIEW_KEY) !== "false",
      nonProxyEnhancementsEnabled: window.localStorage.getItem(NON_PROXY_ENHANCEMENTS_PREVIEW_KEY) !== "false",
      floatingBubbleEnabled: previewFloatingBubbleEnabled(),
      privacyMode: window.localStorage.getItem(PRIVACY_MODE_PREVIEW_KEY) !== "false",
      hideAccountNotes: window.localStorage.getItem(HIDE_ACCOUNT_NOTES_PREVIEW_KEY) === "true",
      bubbleResetDisplay: window.localStorage.getItem(BUBBLE_RESET_DISPLAY_PREVIEW_KEY) === "resetAt" ? "resetAt" : "countdown",
      bubbleStyle: previewBubbleStyle(),
      themeColor: normalizeThemeColor(window.localStorage.getItem(THEME_COLOR_PREVIEW_KEY) ?? DEFAULT_THEME_COLOR),
      cloudBaseUrl: window.localStorage.getItem(CLOUD_BASE_URL_PREVIEW_KEY) ?? DEFAULT_CLOUD_BASE_URL,
      showCustomCloudServer: false,
      tokenUsageWeeks: Number(window.localStorage.getItem(TOKEN_USAGE_WEEKS_PREVIEW_KEY)) || 10,
      tokenUsageRefreshSeconds: Number(window.localStorage.getItem(TOKEN_USAGE_REFRESH_PREVIEW_KEY)) || 60,
      codexUsageSummaryEnabled: window.localStorage.getItem(CODEX_USAGE_SUMMARY_PREVIEW_KEY) !== "false",
      autoDisableStatusCodes: previewAutoDisableStatusCodes(),
      upstream429RetryTimeoutSeconds: previewUpstream429RetryTimeoutSeconds(),
      showUsageNetworkErrors: window.localStorage.getItem(SHOW_USAGE_NETWORK_ERRORS_PREVIEW_KEY) === "true",
      gpt56SolContextWindow: legacyGpt56SolContextWindow() ?? DEFAULT_GPT_5_6_SOL_CONTEXT_WINDOW,
      webProxyPort: previewLocalProxyStatus().port || null,
      webProxyListenOnAllInterfaces:
        window.localStorage.getItem(WEB_PROXY_LISTEN_ALL_INTERFACES_PREVIEW_KEY) === "true",
      networkProxy: {
        enabled: window.localStorage.getItem(NETWORK_PROXY_ENABLED_PREVIEW_KEY) === "true",
        proxyUrl: window.localStorage.getItem(NETWORK_PROXY_URL_PREVIEW_KEY) ?? "",
        proxyPort: Number(window.localStorage.getItem(NETWORK_PROXY_PORT_PREVIEW_KEY)) || null,
      },
      providerGroups: [...new Set([...previewProviderGroups(), ...previewAccountGroups()])],
      accountGroups: [...new Set([...previewProviderGroups(), ...previewAccountGroups()])],
      thirdPartyAppWrite: previewThirdPartyAppWriteSettings(),
      claudeCodeWriteTarget: previewClaudeCodeWriteTarget(),
    };
  }
  return invoke<AppSettings>("get_app_settings");
}


function previewClaudeCodeWriteTarget(): ClaudeCodeWriteTarget {
  const value = window.localStorage.getItem(CLAUDE_CODE_WRITE_TARGET_PREVIEW_KEY);
  return value === "all" || value === "claudeCode" ? value : "codex";
}


function previewThirdPartyAppWriteSettings(): ThirdPartyAppWriteSettings {
  const serialized = window.localStorage.getItem(THIRD_PARTY_APP_WRITE_PREVIEW_KEY);
  if (!serialized) {
    return normalizeThirdPartyAppWriteSettings(undefined, previewClaudeCodeWriteTarget());
  }
  try {
    const value: unknown = JSON.parse(serialized);
    if (!value || typeof value !== "object") return normalizeThirdPartyAppWriteSettings(undefined);
    const record = value as Record<string, unknown>;
    const rawApps = record.apps && typeof record.apps === "object"
      ? record.apps as Record<string, unknown>
      : {};
    const apps: Partial<ThirdPartyAppWriteSettings["apps"]> = {};
    for (const appId of THIRD_PARTY_APP_IDS) {
      if (typeof rawApps[appId] === "boolean") apps[appId] = rawApps[appId];
    }
    return normalizeThirdPartyAppWriteSettings({
      enabled: typeof record.enabled === "boolean" ? record.enabled : undefined,
      writeCodex: typeof record.writeCodex === "boolean" ? record.writeCodex : undefined,
      claudeSubagentModel: record.claudeSubagentModel === "luna"
        || record.claudeSubagentModel === "terra" ? record.claudeSubagentModel : "sol",
      apps,
    });
  } catch {
    return normalizeThirdPartyAppWriteSettings(undefined, previewClaudeCodeWriteTarget());
  }
}


function readPreviewSystemPromptRules(key: string): SystemPromptRule[] {
  try {
    const stored = JSON.parse(window.localStorage.getItem(key) ?? "[]") as unknown;
    if (!Array.isArray(stored)) return [];
    return stored.flatMap((entry): SystemPromptRule[] => {
      if (typeof entry === "string") return [{ name: "", text: entry, enabled: true }];
      if (!entry || typeof entry !== "object") return [];
      const value = entry as { name?: unknown; text?: unknown; enabled?: unknown };
      return typeof value.text === "string"
        ? [{
            name: typeof value.name === "string" ? value.name : "",
            text: value.text,
            enabled: value.enabled !== false,
          }]
        : [];
    });
  } catch {
    return [];
  }
}


function readPreviewSystemPromptFilterRules(): SystemPromptRule[] {
  return readPreviewSystemPromptRules(SYSTEM_PROMPT_FILTER_RULES_PREVIEW_KEY);
}


function readPreviewSystemPromptInjectionPrompts(): SystemPromptRule[] {
  return readPreviewSystemPromptRules(SYSTEM_PROMPT_INJECTION_PROMPTS_PREVIEW_KEY);
}


export async function fetchAntigravityModels(
  baseUrl: string,
  apiKey?: string,
  providerId?: string,
): Promise<string[]> {
  if (!hasLocalBackend) {
    return ANTIGRAVITY_FALLBACK_MODELS;
  }
  return invoke<string[]>("fetch_antigravity_models", {
    baseUrl,
    apiKey: apiKey?.trim() || null,
    providerId: providerId ?? null,
  });
}


export async function fetchRelayModels(baseUrl: string, apiKey: string, providerId?: string,
  options?: { apiFormat?: import("../types").ProviderApiFormat;
    requestOptions?: import("../types").ProviderRequestOptions }): Promise<string[]> {
  if (!hasLocalBackend) {
    return [DEFAULT_OPENAI_PROVIDER_MODEL, "gpt-5.6-sol", "gpt-5.4"];
  }
  return invoke<string[]>("fetch_relay_models", {
    request: { baseUrl, apiKey: apiKey.trim(), providerId: providerId ?? null, options: options ?? null },
  });
}


export async function detectRelayPlatform(
  baseUrl: string,
  apiKey: string,
): Promise<ProviderBalancePlatform | null> {
  if (!hasLocalBackend) return null;
  return invoke<ProviderBalancePlatform | null>("detect_relay_platform", {
    baseUrl,
    apiKey: apiKey.trim(),
  });
}


async function performProviderBalanceQuery(id: string): Promise<ProviderBalance> {
  if (!hasLocalBackend) {
    const provider = readPreviewProviders().find((item) => item.id === id);
    if (!provider) throw new Error("Provider does not exist");
    if (!provider.balancePlatform) throw new Error("Provider balance query is not enabled");
    return {
      apiAmount: provider.balancePlatform === "newApi" ? 108.08 : provider.balancePlatform === "deepSeek" ? 88.8 : 42.5,
      apiUnit: provider.balancePlatform === "deepSeek" ? "CNY" : "USD",
      apiUnlimited: false,
      walletAmount: provider.balancePlatform !== "deepSeek" && (provider.hasWalletQueryToken || provider.hasWalletLoginCredentials) ? 66.6 : null,
      walletUnit: "USD",
      walletError: null,
      balanceItems: provider.balancePlatform === "deepSeek"
        ? [{ amount: 88.8, unit: "CNY" }, { amount: 12.5, unit: "USD" }]
        : [],
      queriedAt: Math.floor(Date.now() / 1000),
    };
  }
  return invoke<ProviderBalance>("query_provider_balance", { id });
}


export function queryProviderBalance(id: string): Promise<ProviderBalance> {
  const pending = providerBalanceRequests.get(id);
  if (pending) return pending;

  const request = performProviderBalanceQuery(id)
    .then((balance) => {
      window.dispatchEvent(new CustomEvent<ProviderBalanceEventDetail>(
        PROVIDER_BALANCE_EVENT,
        { detail: { id, balance } },
      ));
      return balance;
    })
    .finally(() => providerBalanceRequests.delete(id));
  providerBalanceRequests.set(id, request);
  return request;
}


function previewProviderGroups(): string[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(PROVIDER_GROUPS_PREVIEW_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((group): group is string => typeof group === "string") : [];
  } catch {
    return [];
  }
}


function previewAccountGroups(): string[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(ACCOUNT_GROUPS_PREVIEW_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((group): group is string => typeof group === "string") : [];
  } catch {
    return [];
  }
}


export async function loadTokenUsageEntries(startTs?: number): Promise<TokenUsageEntry[]> {
  if (!hasLocalBackend) {
    const now = Math.floor(Date.now() / 1000);
    const entries = [
      {
        id: "preview-token-1",
        ts: now - 92,
        provider: "Official Codex",
        accountId: "workspace-personal",
        accountEmail: "alex.chen@example.com",
        model: "gpt-5-codex",
        durationMs: 16720,
        inputTokens: 72_088,
        outputTokens: 13_760,
        reasoningTokens: 13_440,
        cachedTokens: 69_456,
        totalTokens: 85_848,
        modelContextWindow: 258_400,
      },
      {
        id: "preview-token-2",
        ts: now - 109,
        provider: "AICoding.sh",
        model: "gpt-5-codex",
        durationMs: 3280,
        inputTokens: 19548,
        outputTokens: 32,
        reasoningTokens: 0,
        cachedTokens: 19012,
        totalTokens: 19580,
        modelContextWindow: 121_600,
      },
    ];
    return startTs == null ? entries : entries.filter((entry) => entry.ts >= startTs);
  }
  if (startTs != null) {
    return invoke<TokenUsageEntry[]>("list_token_usage_entries_since", { startTs });
  }
  return invoke<TokenUsageEntry[]>("list_token_usage_entries");
}


export async function loadDailyTokenUsage(startTs: number): Promise<DailyTokenUsage[]> {
  if (!hasLocalBackend) {
    const entries: DailyTokenUsage[] = [];
    const date = new Date(startTs * 1000);
    date.setHours(12, 0, 0, 0);
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    while (date <= today) {
      const signal = date.getDate() + date.getMonth() * 7 + date.getDay() * 3;
      if (signal % 4 !== 0) {
        entries.push({
          date: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`,
          totalTokens: (signal % 7 + 1) * 18_400,
          inputTokens: (signal % 7 + 1) * 14_200,
          outputTokens: (signal % 7 + 1) * 4_200,
          reasoningTokens: (signal % 4 + 1) * 1_150,
          cachedTokens: (signal % 5 + 1) * 8_100,
        });
      }
      date.setDate(date.getDate() + 1);
    }
    return entries;
  }
  return invoke<DailyTokenUsage[]>("list_daily_token_usage", { startTs });
}


export async function loadTokenUsageBreakdown(
  startTs: number,
  longContextThresholdTokens: number,
): Promise<DailyTokenUsageBreakdown[]> {
  if (!hasLocalBackend) return previewTokenBreakdown(await loadDailyTokenUsage(startTs));
  return invoke<DailyTokenUsageBreakdown[]>("list_token_usage_breakdown", {
    startTs, longContextThresholdTokens,
  });
}


export async function loadAccountQuotaHistory(startTs: number, endTs: number): Promise<AccountQuotaHistory[]> {
  if (!hasLocalBackend) return previewAccountQuotaHistory(startTs, endTs);
  return invoke<AccountQuotaHistory[]>("list_account_quota_history", { startTs, endTs });
}


export async function loadCloudAuthState(): Promise<CloudAuthState> {
  if (!hasLocalBackend) return previewCloudState();
  return invoke<CloudAuthState>("get_cloud_auth_state");
}


export async function beginLogin(embedded: boolean, privateMode = false, accountId?: string): Promise<LoginStart | null> {
  if (!isDesktopApp) return null;
  return invoke<LoginStart>("start_login", { embedded, privateMode, accountId });
}


export async function cancelAccountLogin():Promise<void>{
  if(isDesktopApp)await invoke('cancel_login');
}


export type ImportAuthResult =
  | { status: "imported"; id: string }
  | { status: "cancelled" }
  | { status: "preview" };


export type CompatibleJsonImportResult =
  | { status: "imported"; ids: string[]; skipped: string[] }
  | { status: "cancelled" }
  | { status: "preview" };


export async function chooseAndImportAuth(): Promise<ImportAuthResult> {
  if (!isDesktopApp) return { status: "preview" };
  const selected = await open({
    multiple: false,
    filters: [{ name: "Codex auth.json", extensions: ["json"] }],
  });
  if (!selected) return { status: "cancelled" };
  const id = await invoke<string>("import_local_auth_file", { path: selected });
  return { status: "imported", id };
}


export async function importAccountJsonText(content: string): Promise<CompatibleJsonImportResult> {
  if (!hasLocalBackend) return { status: "preview" };
  const result = await invoke<{ importedIds: string[]; skipped: string[] }>("import_account_json_text", { content });
  return { status: "imported", ids: result.importedIds, skipped: result.skipped };
}


export async function chooseAndImportAccountJson(): Promise<CompatibleJsonImportResult> {
  if (isDesktopApp) {
    const result = await chooseAndImportAuth();
    return result.status === 'imported'
      ? { status: 'imported', ids: [result.id], skipped: [] }
      : result;
  }
  if (isHostedWebApp) {
    const content = await chooseBrowserAccountFile();
    return content === null ? { status: "cancelled" } : importAccountJsonText(content);
  }
  if (!isDesktopApp) return { status: "preview" };
  const selected = await open({
    multiple: false,
    filters: [{ name: "Codex account JSON", extensions: ["json", "jsonl", "ndjson"] }],
  });
  if (!selected) return { status: "cancelled" };
  const result = await invoke<{ importedIds: string[]; skipped: string[] }>("import_account_json_file", { path: selected });
  return { status: "imported", ids: result.importedIds, skipped: result.skipped };
}


export async function activateAccount(id: string): Promise<void> {
  if (!hasLocalBackend) {
    window.localStorage.removeItem(ACTIVE_GROUP_PREVIEW_KEY);
    writePreviewProviders(readPreviewProviders().map((provider) => ({ ...provider, active: false })));
    return;
  }
  await invoke("switch_local_account", { id });
}


export async function loadAccountHealth(ids: string[]): Promise<Record<string, AccountHealth>> {
  if (hasLocalBackend) return invoke('load_account_health', { ids });
  return Object.fromEntries(ids.map((id) => [id, { status: 'unchecked', checkedAt: null }]));
}


export async function checkAccountHealth(id: string): Promise<AccountHealth> {
  if (hasLocalBackend) return invoke('check_account_health', { id });
  // Preview never invents successful authentication for a demonstration identity.
  return { status: 'unchecked', checkedAt: null };
}


export async function refreshAccountUsage(id: string): Promise<void> {
  if (hasLocalBackend) await invoke("refresh_usage", { id });
}


export async function removeAccount(id: string): Promise<void> {
  if (hasLocalBackend) await invoke("delete_account", { id });
}


export async function launchChatGpt(): Promise<boolean> {
  if (hasLocalBackend) return invoke<boolean>("launch_local_codex");
  return false;
}


const HOSTED_BACKEND_POLL_INTERVAL_MS = 2_500;


function pollHostedBackend(callback: () => void | Promise<void>): () => void {
  let running = false;
  const poll = async () => {
    if (running) return;
    running = true;
    try {
      await callback();
    } catch {
      // A later poll will retry after transient local-server errors.
    } finally {
      running = false;
    }
  };
  const timer = window.setInterval(() => void poll(), HOSTED_BACKEND_POLL_INTERVAL_MS);
  return () => window.clearInterval(timer);
}


export function subscribeToBackendEvents(
  onAccountsChanged: () => void,
  onLoginStatus: (status: LoginStatus) => void,
): () => void {
  if (isHostedWebApp) return pollHostedBackend(onAccountsChanged);
  if (!isDesktopApp) return () => undefined;

  const subscriptions: Promise<UnlistenFn>[] = [
    listen("accounts-changed", onAccountsChanged),
    listen<LoginStatus>("login-status", ({ payload }) => onLoginStatus(payload)),
  ];
  return () => subscriptions.forEach((subscription) => void subscription.then((unlisten) => unlisten()));
}


export function subscribeToProviderEvents(onProvidersChanged: () => void | Promise<void>): () => void {
  let active = true;
  const onChange = () => {
    if (active) return onProvidersChanged();
  };
  let unsubscribe: () => void;
  if (isHostedWebApp) {
    unsubscribe = pollHostedBackend(onChange);
  } else if (!isDesktopApp) {
    window.addEventListener(PROVIDERS_EVENT, onChange);
    unsubscribe = () => window.removeEventListener(PROVIDERS_EVENT, onChange);
  } else {
    const subscription = listen("providers-changed", onChange);
    unsubscribe = () => void subscription.then((unlisten) => unlisten());
  }
  return () => {
    active = false;
    unsubscribe();
  };
}


let languageSave = Promise.resolve();

let languageRevision = 0;


export async function publishLanguageChange(language: Language): Promise<void> {
  const revision = ++languageRevision;
  try { window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language); }
  catch { /* A blocked browser store must not prevent the other windows from updating. */ }
  if (!hasLocalBackend) {
    window.dispatchEvent(new CustomEvent<Language>(LANGUAGE_EVENT, { detail: language }));
    return;
  }
  // Preserve tap order across asynchronous storage workers and suppress obsolete broadcasts.
  const saved = languageSave.then(() => invoke<void>("set_app_language", { language }));
  languageSave = saved.catch(() => undefined);
  await saved;
  if (revision !== languageRevision) return;
  if (isDesktopApp) await emit(LANGUAGE_EVENT, language);
  else window.dispatchEvent(new CustomEvent<Language>(LANGUAGE_EVENT, { detail: language }));
}


export function subscribeToLanguageChanges(onChange: (language: Language) => void): () => void {
  const handleLanguage = (value: unknown) => {
    if (isLanguage(value)) onChange(value);
  };
  if (!isDesktopApp) {
    const handleLanguageChange = (event: Event) => {
      handleLanguage((event as CustomEvent<Language>).detail);
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key === LANGUAGE_STORAGE_KEY) handleLanguage(event.newValue);
    };
    window.addEventListener(LANGUAGE_EVENT, handleLanguageChange);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener(LANGUAGE_EVENT, handleLanguageChange);
      window.removeEventListener("storage", handleStorage);
    };
  }

  const subscription = listen<Language>(LANGUAGE_EVENT, ({ payload }) => {
    handleLanguage(payload);
  });
  return () => void subscription.then((unlisten) => unlisten());
}