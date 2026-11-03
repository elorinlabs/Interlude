  const localProxyProviderId = "codex-switch-local";
  const hasActiveProxyModelQuery = (noAuthOnly = false) => queryClient.getQueryCache().getAll().some(query => {
    const key = query.queryKey;
    const active = typeof query.isActive === "function"
      ? query.isActive()
      : (query.observers?.length ?? 0) > 0;
    return active && matchesModelsQuery(query) && key[2] === "local" &&
      (key[3] === "no-auth" || (!noAuthOnly && key.includes(localProxyProviderId)));
  });
  const syncComposerStatus = () => {
    // Logged-in queries can still use our proxy; direct ChatGPT requests are not accounted for here.
    const allowed = proxyRunning && hasActiveProxyModelQuery();
    // Logged-in Codex already provides its own speed controls.
    const fastModeAllowed = allowed && fastModeModels.size > 0 && hasActiveProxyModelQuery(true);
    const changed = window.__CODEX_SWITCH_COMPOSER_STATUS_ALLOWED__ !== allowed ||
      window.__CODEX_SWITCH_FAST_MODE_ALLOWED__ !== fastModeAllowed;
    window.__CODEX_SWITCH_COMPOSER_STATUS_ALLOWED__ = allowed;
    window.__CODEX_SWITCH_FAST_MODE_ALLOWED__ = fastModeAllowed;
    if (changed) window.__CODEX_SWITCH_REFRESH_SPEED_SELECTOR__?.();
  };
  syncComposerStatus();
  window.__CODEX_SWITCH_COMPOSER_STATUS_OBSERVER__?.unsubscribe?.();
  window.__CODEX_SWITCH_COMPOSER_STATUS_OBSERVER__ = {
    proxyRunning,
    unsubscribe: queryClient.getQueryCache().subscribe(event => {
      if (matchesModelsQuery(event?.query)) syncComposerStatus();
    }),
  };
  syncComposerStatus();
