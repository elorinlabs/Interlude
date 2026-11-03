import type { LocalProxyLanApiKey } from "../types";

export const DEFAULT_USAGE_REVIEW_THRESHOLD = 1_000;
export const MAX_USAGE_REVIEW_THRESHOLD = 1_000_000_000;

export function unconfirmedRequests(key: LocalProxyLanApiKey): number {
  return key.unconfirmedRequests ?? (key.usageIncomplete ? 1 : 0);
}

export function usageReviewThreshold(key: LocalProxyLanApiKey): number {
  return key.usageReviewThreshold ?? DEFAULT_USAGE_REVIEW_THRESHOLD;
}

export function needsUsageReview(key: LocalProxyLanApiKey): boolean {
  return key.quotaUsd !== null && unconfirmedRequests(key) >= usageReviewThreshold(key);
}
