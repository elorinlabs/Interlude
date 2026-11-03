use std::{
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    thread,
    time::{Duration, Instant},
};

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use rand::RngCore;
use reqwest::blocking::Client;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use tauri::{Emitter, Manager, Runtime, State, WebviewUrl};
use tauri_plugin_opener::OpenerExt;
use tiny_http::Server;
use crate::oauth_callback::respond as html_response;
#[cfg(test)]use crate::oauth_callback::page as callback_page_html;

use crate::{
    auth::decode_jwt,
    browser::open_default_private,
    codex_api::{CLIENT_ID, ISSUER, ORIGINATOR},
    models::{LoginStart, LoginStatus},
    storage::import_local_oauth,
};

#[derive(Default)]
pub(crate) struct AppState {
    login_cancel: Mutex<Option<Arc<AtomicBool>>>,
    login_start: Mutex<()>,
}

fn random_urlsafe<const N: usize>() -> String {
    let mut bytes = [0_u8; N];
    rand::rng().fill_bytes(&mut bytes);
    URL_SAFE_NO_PAD.encode(bytes)
}

fn bind_login_server() -> Result<(Server, u16), String> {
    let deadline=Instant::now()+Duration::from_secs(1);
    loop{
        for port in [1455_u16, 1457_u16] {
            if let Ok(server) = Server::http(("127.0.0.1", port)) {return Ok((server,port));}
        }
        if Instant::now()>=deadline{break;}
        thread::sleep(Duration::from_millis(25));
    }
    Err("登录回调端口 1455 和 1457 均被占用，请关闭其他 Codex 登录窗口后重试".to_string())
}

fn authorize_url(port: u16, state: &str, challenge: &str) -> Result<String, String> {
    let redirect_uri = format!("http://localhost:{port}/auth/callback");
    let mut url =
        url::Url::parse(&format!("{ISSUER}/oauth/authorize")).map_err(|error| error.to_string())?;
    url.query_pairs_mut()
        .append_pair("response_type", "code")
        .append_pair("client_id", CLIENT_ID)
        .append_pair("redirect_uri", &redirect_uri)
        .append_pair(
            "scope",
            "openid profile email offline_access api.connectors.read api.connectors.invoke",
        )
        .append_pair("code_challenge", challenge)
        .append_pair("code_challenge_method", "S256")
        .append_pair("id_token_add_organizations", "true")
        .append_pair("codex_cli_simplified_flow", "true")
        .append_pair("state", state)
        .append_pair("originator", ORIGINATOR);
    Ok(url.to_string())
}

fn exchange_code(client: &Client, port: u16, code: &str, verifier: &str) -> Result<Value, String> {
    let redirect_uri = format!("http://localhost:{port}/auth/callback");
    let response = client
        .post(format!("{ISSUER}/oauth/token"))
        .header("Content-Type", "application/x-www-form-urlencoded")
        .header("originator", ORIGINATOR)
        .form(&[
            ("grant_type", "authorization_code"),
            ("code", code),
            ("redirect_uri", &redirect_uri),
            ("client_id", CLIENT_ID),
            ("code_verifier", verifier),
        ])
        .send()
        .map_err(|error| format!("登录凭据交换失败：{error}"))?;
    if !response.status().is_success() {
        let status = response.status();
        if status == reqwest::StatusCode::FORBIDDEN {
            return Err(
                "登录请求被拒绝（HTTP 403）。请将代理切换为TUN+全局模式后重试，否则登录服务仍可能识别到当前网络来自不支持的地区。"
                    .to_string(),
            );
        }
        return Err(format!("登录凭据交换失败（HTTP {status}）"));
    }
    response
        .json()
        .map_err(|error| format!("登录响应格式无效：{error}"))
}

pub(crate) fn emit_login<R: Runtime>(
    app: &tauri::AppHandle<R>,
    ok: bool,
    message: impl Into<String>,
    account_id: Option<String>,
) {
    let _ = app.emit(
        "login-status",
        LoginStatus {
            ok,
            message: message.into(),
            account_id,
        },
    );
}

fn close_login_window_later<R: Runtime + 'static>(app: tauri::AppHandle<R>) {
    let completed_window = app.get_webview_window("codex-login");
    thread::spawn(move || {
        thread::sleep(Duration::from_millis(850));
        // A batch may already have opened the next login under the same label.
        // Close only the window belonging to the completed authorization.
        if let Some(window) = completed_window {
            let _ = window.close();
        }
    });
}

fn refresh_saved_account_usage<R: Runtime>(app: &tauri::AppHandle<R>, account_id: &str) {
    if let Err(error) = crate::commands::refresh_usage_blocking(app.clone(), account_id.to_string())
    {
        eprintln!("initial account usage refresh failed: {error}");
    }
}

fn open_login_in_default_browser<R: Runtime>(
    app: &tauri::AppHandle<R>,
    url: &str,
) -> Result<(), String> {
    app.opener()
        .open_url(url.to_string(), None::<&str>)
        .map_err(|error| format!("无法打开默认浏览器：{error}"))
}

fn open_login_browser<R: Runtime>(
    app: &tauri::AppHandle<R>,
    url: &str,
    private_mode: bool,
) -> Result<(), String> {
    if private_mode {
        return open_default_private(app, url);
    }
    open_login_in_default_browser(app, url)
}

fn open_embedded_login_window<R: Runtime + 'static>(
    app: &tauri::AppHandle<R>,
    url: &str,
    cancel: Arc<AtomicBool>,
    automatic: Option<String>,
) -> Result<(), String> {
    let fallback_url = url.to_string();
    let window_app = app.clone();
    app.run_on_main_thread(move || {
        let result = (|| {
            if let Some(window) = window_app.get_webview_window("codex-login") {
                let _ = window.close();
            }
            let redirect_target = serde_json::to_string(&fallback_url)
                .unwrap_or_else(|_| "\"about:blank\"".to_string());
            let redirect_script =
                format!("window.setTimeout(() => window.location.replace({redirect_target}), 50);");
            let automatic_page=automatic.clone();
            let navigation_app=window_app.clone();
            let navigation_account=automatic.clone();
            let official_page=Arc::new(AtomicBool::new(false));
            let window = crate::webview_windows::builder(
                &window_app,
                "codex-login",
                WebviewUrl::App("login.html".into()),
            )
            .title(crate::storage::native_text("登录 ChatGPT - Interlude"))
            .inner_size(520.0, 720.0)
            .min_inner_size(420.0, 620.0)
            .center()
            .incognito(true)
            .visible(automatic.is_none())
            .on_navigation(move|url|{
                if url.scheme()=="interlude-recovery" {
                    if let (Some(id),Some(window))=(&navigation_account,navigation_app.get_webview_window("codex-login")) {
                        if !official_page.load(Ordering::Relaxed) { return false; }
                        let stage=match url.host_str() {
                            Some("progress")=>url.path().trim_start_matches('/'),
                            Some("refresh")=>{
                                if let Ok(script)=crate::account_recovery::fill_script(id) {let _=window.eval(script);}
                                return false;
                            },
                            _=>"needsAttention",
                        };
                        if matches!(stage,"email"|"password"|"totp"|"callback"|"needsAttention") {
                            let _=navigation_app.emit("account-recovery-progress",json!({"accountId":id,"stage":stage}));
                        }
                        if stage=="needsAttention" {let _=window.show();let _=window.set_focus();}
                    }
                    return false;
                }
                official_page.store(url.scheme()=="https"&&url.host_str()==Some("auth.openai.com"),Ordering::Relaxed);
                true
            })
            .on_page_load(move|view,payload|{
                if matches!(payload.event(),tauri::webview::PageLoadEvent::Finished)
                    &&payload.url().scheme()=="https"&&payload.url().host_str()==Some("auth.openai.com") {
                    if let Some(id)=&automatic_page {
                        if let Ok(script)=crate::account_recovery::fill_script(id){
                            // Secrets exist only in the official login webview's memory.
                            let _=view.eval(script);
                        }
                    }
                }
            })
            .build()?;
            if automatic.is_none(){window.show()?;window.set_focus()?;}
            window.eval(redirect_script)?;
            Ok::<(), tauri::Error>(())
        })();

        if let Err(error) = result {
            match open_login_in_default_browser(&window_app, &fallback_url) {
                Ok(()) => emit_login(
                    &window_app,
                    false,
                    format!("应用内登录窗口打开失败，已改用默认浏览器：{error}"),
                    None,
                ),
                Err(open_error) => {
                    cancel.store(true, Ordering::Relaxed);
                    emit_login(
                        &window_app,
                        false,
                        format!("无法打开登录页面：{error}；{open_error}"),
                        None,
                    );
                }
            }
        }
    })
    .map_err(|error| format!("无法调度应用内登录窗口：{error}"))
}

fn run_login_loop<R: Runtime + 'static>(
    app: tauri::AppHandle<R>,
    server: Server,
    port: u16,
    expected_state: String,
    verifier: String,
    cancel: Arc<AtomicBool>,
    expected_account: Option<String>,
) {
    let started = Instant::now();
    while !cancel.load(Ordering::Relaxed) && started.elapsed() < Duration::from_secs(600) {
        let request = match server.recv_timeout(Duration::from_millis(250)) {
            Ok(Some(request)) => request,
            Ok(None) => continue,
            Err(_) => break,
        };
        if !crate::oauth_callback::valid_request(request.method().as_str(),request.remote_addr().map(|address|address.ip()),request.url()){
            html_response(request,400,"登录请求无效","回调地址无法解析，请重新尝试。");continue;
        }
        let parsed = match url::Url::parse(&format!("http://localhost{}", request.url())) {
            Ok(value) => value,
            Err(_) => {
                html_response(
                    request,
                    400,
                    "登录请求无效",
                    "回调地址无法解析，请重新尝试。",
                );
                continue;
            }
        };
        if parsed.path() != "/auth/callback" {
            html_response(request, 404, "页面不存在", "请回到 Interlude 继续操作。");
            continue;
        }
        let params=match crate::oauth_callback::parameters(&parsed){Ok(value)=>value,Err(())=>{
            html_response(request,400,"登录请求无效","回调地址无法解析，请重新尝试。");continue;
        }};
        if params.get("state") != Some(&expected_state) {
            html_response(
                request,
                400,
                "安全校验失败",
                "登录 state 不匹配，请关闭窗口后重试。",
            );
            continue;
        }
        if let Some(error) = params.get("error") {
            let description = params
                .get("error_description")
                .map(String::as_str)
                .unwrap_or(error);
            html_response(request, 403, "登录未完成", description);
            emit_login(&app, false, format!("登录失败：{description}"), None);
            break;
        }
        let Some(code) = params.get("code").filter(|value| !value.is_empty()) else {
            html_response(request, 400, "登录未完成", "授权响应中缺少 code。");
            emit_login(&app, false, "登录失败：授权响应缺少 code", None);
            break;
        };
        let client = match crate::system_proxy::apply(Client::builder())
            .timeout(Duration::from_secs(25))
            .build()
        {
            Ok(client) => client,
            Err(error) => {
                html_response(request, 500, "登录失败", "无法创建安全网络连接。");
                emit_login(&app, false, format!("登录失败：{error}"), None);
                break;
            }
        };
        if let Some(id)=&expected_account {
            let _=app.emit("account-recovery-progress",json!({"accountId":id,"stage":"callback"}));
        }
        match exchange_code(&client, port, code, &verifier)
            .and_then(|tokens| {
                if cancel.load(Ordering::Relaxed){return Err("savedLoginCancelled".into());}
                persist_login(&app, tokens, expected_account.as_deref())
            })
        {
            Ok((account_id, reapplied)) => {
                let success_message = if reapplied {
                    "当前账户凭据已更新，并已重新应用。"
                } else {
                    "账户已保存。请回到 Interlude 手动切换到此账户。"
                };
                html_response(request, 200, "登录成功", success_message);
                let _ = app.emit("accounts-changed", ());
                close_login_window_later(app.clone());
                emit_login(
                    &app,
                    true,
                    if reapplied {
                        "登录成功，当前账户凭据已更新"
                    } else {
                        "登录成功，账户已保存，可手动切换"
                    },
                    Some(account_id.clone()),
                );
                crate::system_tray::refresh_menu(&app);
                if expected_account.is_none(){
                    let worker=app.clone();thread::spawn(move||refresh_saved_account_usage(&worker,&account_id));
                }
                break;
            }
            Err(error) => {
                html_response(request, 500, "登录失败", &error);
                if !cancel.load(Ordering::Relaxed){emit_login(&app, false, error, None);}
                break;
            }
        }
    }
    if !cancel.load(Ordering::Relaxed)&&started.elapsed()>=Duration::from_secs(600){
        emit_login(&app,false,"loginTimedOut",None);
    }
}

fn persist_login<R: Runtime>(
    app: &tauri::AppHandle<R>,
    tokens: Value,
    expected_account: Option<&str>,
) -> Result<(String, bool), String> {
    let id_token = tokens
        .get("id_token")
        .and_then(Value::as_str)
        .ok_or_else(|| "登录响应缺少 id_token".to_string())?;
    let access_token = tokens
        .get("access_token")
        .and_then(Value::as_str)
        .ok_or_else(|| "登录响应缺少 access_token".to_string())?;
    let refresh_token = tokens
        .get("refresh_token")
        .and_then(Value::as_str)
        .ok_or_else(|| "登录响应缺少 refresh_token".to_string())?;
    let claims = decode_jwt(id_token)?;
    let account_id = claims
        .get("https://api.openai.com/auth")
        .and_then(|value| value.get("chatgpt_account_id"))
        .and_then(Value::as_str);
    let auth = json!({
        "auth_mode": "chatgpt",
        "OPENAI_API_KEY": null,
        "tokens": {
            "id_token": id_token,
            "access_token": access_token,
            "refresh_token": refresh_token,
            "account_id": account_id,
        },
        "last_refresh": chrono::Utc::now().to_rfc3339(),
    });
    if let Some(expected)=expected_account {
        let (_,_,_,actual)=crate::auth::account_fields(&auth)?;
        if actual!=expected{return Err("savedLoginAccountMismatch".into());}
    }
    let account_id = import_local_oauth(app, auth)?;
    let reapplied = match crate::commands::reapply_active_account_after_login(
        app.clone(),
        account_id.clone(),
    ) {
        Ok(reapplied) => reapplied,
        Err(error) => {
            eprintln!("failed to reapply refreshed active account {account_id}: {error}");
            false
        }
    };
    Ok((account_id, reapplied))
}

#[tauri::command]
pub(crate) fn cancel_login<R: Runtime>(app:tauri::AppHandle<R>,state:State<'_,AppState>)->Result<(),String>{
    if let Some(cancel)=state.login_cancel.lock().map_err(|_|"savedLoginFailed")?.take(){
        cancel.store(true,Ordering::Relaxed);
    }
    if let Some(window)=app.get_webview_window("codex-login") {window.close().map_err(|_|"savedLoginFailed")?;}
    Ok(())
}

#[tauri::command]
pub(crate) async fn start_login<R: Runtime + 'static>(
    app: tauri::AppHandle<R>,
    embedded: bool,
    private_mode: bool,
    account_id: Option<String>,
) -> Result<LoginStart, String> {
    tauri::async_runtime::spawn_blocking(move||start_login_blocking(app,embedded,private_mode,account_id))
        .await.map_err(|_|"savedLoginFailed".to_string())?
}
fn start_login_blocking<R:Runtime+'static>(app:tauri::AppHandle<R>,embedded:bool,private_mode:bool,account_id:Option<String>)->Result<LoginStart,String>{
    let state=app.state::<AppState>();
    let _start=state.login_start.lock().map_err(|_|"savedLoginFailed")?;
    let automatic=if let Some(id)=&account_id {
        crate::account_recovery::load(id)?.map(|_|id.clone())
    }else{None};
    if let Some(id)=&automatic {crate::account_recovery::reserve_attempt(id)?;}
    if let Some(previous) = state
        .login_cancel
        .lock()
        .map_err(|_| "登录状态锁已损坏".to_string())?
        .take()
    {
        previous.store(true, Ordering::Relaxed);
    }
    if let Some(window) = app.get_webview_window("codex-login") {
        let _ = window.close();
    }
    let (server, port) = bind_login_server()?;
    let verifier = random_urlsafe::<64>();
    let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
    let oauth_state = random_urlsafe::<32>();
    let url = authorize_url(port, &oauth_state, &challenge)?;
    let cancel = Arc::new(AtomicBool::new(false));
    *state
        .login_cancel
        .lock()
        .map_err(|_| "登录状态锁已损坏".to_string())? = Some(cancel.clone());

    let thread_app = app.clone();
    let thread_cancel = cancel.clone();
    thread::spawn(move || {
        run_login_loop(
            thread_app,
            server,
            port,
            oauth_state,
            verifier,
            thread_cancel,
            account_id,
        )
    });

    if embedded || automatic.is_some() {
        let window_app = app.clone();
        let window_url = url.clone();
        let window_cancel = cancel.clone();
        thread::spawn(move || {
            if let Err(error) =
                open_embedded_login_window(&window_app, &window_url, window_cancel.clone(),automatic)
            {
                window_cancel.store(true, Ordering::Relaxed);
                emit_login(&window_app, false, error, None);
            }
        });
    } else if let Err(error) = open_login_browser(&app, &url, private_mode) {
        cancel.store(true, Ordering::Relaxed);
        return Err(error);
    }
    Ok(LoginStart { url, embedded })
}

#[cfg(test)]
mod tests {
    use super::callback_page_html;
    use crate::storage::{with_interface_language, InterfaceLanguage};

    #[test]
    fn callback_page_keeps_chinese_and_escapes_markup() {
        let page = callback_page_html("登录失败", "<script>x</script>");
        assert!(page.contains(r#"<html lang="zh-CN">"#));
        assert!(page.contains("<title>登录失败 · Interlude</title>"));
        assert!(page.contains("<p>&lt;script&gt;x&lt;/script&gt;</p>"));
    }

    #[test]
    fn callback_page_uses_russian_when_it_was_saved() {
        let page = with_interface_language(InterfaceLanguage::Ru, || {
            callback_page_html(
                "登录成功",
                "账户已保存。请回到 Interlude 手动切换到此账户。",
            )
        });
        assert!(page.contains(r#"<html lang="ru">"#));
        assert!(page.contains("<h1>Вход выполнен</h1>"));
        assert!(page.contains(
            "<p>Аккаунт сохранён. Вернитесь в Interlude и переключитесь на него вручную.</p>"
        ));
    }
}
