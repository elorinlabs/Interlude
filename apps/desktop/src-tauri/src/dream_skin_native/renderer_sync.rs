// Recovery is limited to the recorded renderer; it never launches or restarts Codex.
const RENDERER_SYNC_INTERVAL: Duration = Duration::from_secs(5);
const RENDERER_BINDING_HEALTH_TIMEOUT: Duration = Duration::from_secs(30);
const COMPOSER_SYNC_PROBE: &str = r#"Boolean(
    window.__CODEX_SWITCH_COMPOSER_STATUS_OBSERVER__ &&
    typeof window.__CODEX_SWITCH_REFRESH_SPEED_SELECTOR__ === "function" &&
    (window.__CODEX_SWITCH_COMPOSER_STATUS_ALLOWED__ !== true ||
        window.__CODEX_SWITCH_SPEED_SELECTOR__?.installed)
)"#;
static RENDERER_BINDING_HEALTH: Mutex<Option<RendererBindingHealth>> = Mutex::new(None);
static RENDERER_BINDING_INSTALL_LOCK: Mutex<()> = Mutex::new(());

struct RendererBindingHealth {
    generation: u64,
    endpoint: String,
    last_poll: Instant,
}

impl RendererBindingHealth {
    fn matches(&self, target: &CdpTarget) -> bool {
        self.endpoint == target.web_socket_debugger_url
            && self.last_poll.elapsed() < RENDERER_BINDING_HEALTH_TIMEOUT
    }
}

struct RendererBindingGuard(u64);

impl Drop for RendererBindingGuard {
    fn drop(&mut self) {
        let mut health = RENDERER_BINDING_HEALTH
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        if health
            .as_ref()
            .is_some_and(|active| active.generation == self.0)
        {
            *health = None;
        }
    }
}

fn renderer_bindings_healthy(target: &CdpTarget) -> bool {
    RENDERER_BINDING_HEALTH
        .lock()
        .unwrap_or_else(|error| error.into_inner())
        .as_ref()
        .is_some_and(|health| health.matches(target))
}

fn record_renderer_binding_poll(generation: u64) {
    let mut health = RENDERER_BINDING_HEALTH
        .lock()
        .unwrap_or_else(|error| error.into_inner());
    if let Some(health) = health
        .as_mut()
        .filter(|health| health.generation == generation)
    {
        health.last_poll = Instant::now();
    }
}

fn composer_restore_expression() -> Result<String, String> {
    let tier = serde_json::to_string(crate::local_proxy::proxy_service_tier_name())
        .map_err(|error| error.to_string())?;
    let overlay = speed_selector_overlay_expression(&tier);
    let query_client = include_str!("composer_query_client.js");
    let status = include_str!("composer_status.js");
    let proxy_running = crate::local_proxy::is_running();
    Ok(format!(
        r#"(() => {{
        const proxyRunning = {proxy_running};
        const queryClient = {query_client};
        if (!queryClient) return false;
        const matchesModelsQuery = query => Array.isArray(query?.queryKey) &&
            query.queryKey[0] === "models" && query.queryKey[1] === "list";
        const fastAvailable = window.__CODEX_SWITCH_FAST_MODE_AVAILABLE__ ??
            window.__CODEX_SWITCH_FAST_MODE_ALLOWED__;
        const fastModeModels = new Set(fastAvailable ? ["available"] : []);
        {overlay}
        {status}
        return true;
    }})()"#
    ))
}

fn restore_composer(session: &mut CdpSession) -> Result<(), String> {
    if session.evaluate(&composer_restore_expression()?)?.as_bool() != Some(true) {
        return Err("The Codex composer is not ready for synchronization.".to_string());
    }
    Ok(())
}

fn renderer_sync_healthy(target: &CdpTarget, port: u16) -> bool {
    // Proxy changes must refresh visibility even when the renderer's query cache is unchanged.
    let probe = format!(
        "({COMPOSER_SYNC_PROBE}) && \
         window.__CODEX_SWITCH_COMPOSER_STATUS_OBSERVER__?.proxyRunning === {}",
        crate::local_proxy::is_running()
    );
    renderer_bindings_healthy(target)
        && evaluate_for_binding(target, port, &probe)
            .is_ok_and(|value| value.as_bool() == Some(true))
}

fn maintain_renderer_sync(targets: &[CdpTarget], port: u16, last_check: &mut Option<Instant>) {
    if !runtime_enhancements_enabled()
        || RUNTIME_LAUNCHING.load(Ordering::Acquire)
        || last_check.is_some_and(|last| last.elapsed() < RENDERER_SYNC_INTERVAL)
    {
        return;
    }
    let Ok(_operation) = OPERATION_LOCK.try_lock() else {
        return;
    };
    *last_check = Some(Instant::now());
    let Some(target) = targets
        .iter()
        .find(|target| target.url == "app://-/index.html")
    else {
        return;
    };
    if !renderer_sync_healthy(target, port) {
        if let Err(error) = install_renderer_bindings(target, port) {
            eprintln!("Could not restore Codex composer synchronization: {error}");
        }
    }
}
