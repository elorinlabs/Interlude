mod account_archive;
mod account_automation;
mod account_quota_history;
mod account_recovery;
mod agent_identity;
mod aggregate_api;
mod aggregate_failover;
mod aggregate_scheduler;
mod aggregate_sync;
mod antigravity_provider;
mod auth;
mod autostart;
mod browser;
mod ccs_import;
mod chatgpt_launch;
mod claude_code;
mod claude_code_provider;
mod claude_desktop;
mod client_integration;
mod client_lifecycle;
mod cloud;
mod codex_api;
mod codex_config;
mod codex_connection;
mod codex_gui;
mod codex_home;
mod codex_runtime;
mod codex_settings;
mod codex_usage_cost_rates;
mod codex_usage_summary;
mod commands;
mod computer_use;
mod conversation_hub;
mod coze;
#[cfg(windows)]
mod desktop_service;
mod dream_skin;
mod dream_skin_community;
mod dream_skin_market;
#[cfg(any(target_os = "windows", target_os = "macos"))]
mod dream_skin_native;
#[cfg(any(target_os = "windows", target_os = "macos"))]
mod dream_skin_resources;
mod error_logs;
mod floating_bubble;
mod gui_terminal;
#[cfg(windows)]
mod installer_lifecycle;
mod local_proxy;
mod main_window;
mod models;
mod oauth;
mod oauth_callback;
mod official_models;
mod official_plugins;
mod pet_dock;
mod platform;
mod port_mapping;
mod preset_provider;
mod prompt_plugins;
mod provider_api_cache;
mod provider_discovery;
mod provider_models;
mod providers;
mod quota_display;
mod remote_chat;
mod remote_command;
mod remote_desktop;
mod remote_websocket;
mod rollout_metadata;
mod skills_market;
mod storage;
mod system_proxy;
mod system_tray;
mod third_party_apps;
mod update_peers;
mod webview_windows;
#[cfg(target_os = "windows")]
mod windows_client_processes;

use oauth::AppState;
#[cfg(all(test, windows))]
mod windows_test_resources;
use tauri::Manager;
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut context = tauri::generate_context!();
    // A native startup check must not activate an installed instance or load its automation.
    let startup_smoke = std::env::args_os().any(|argument| argument == "--startup-smoke-test");
    if startup_smoke {
        let isolated_home = std::env::var_os("CODEX_HOME").map(std::path::PathBuf::from);
        if !isolated_home.is_some_and(|path| path.is_absolute() && path.is_dir()) {
            eprintln!("Startup smoke check requires an existing absolute CODEX_HOME.");
            return;
        }
        context.config_mut().identifier.push_str(".smoketest");
    }

    tauri::Builder::default()
        .manage(std::sync::Arc::new(
            account_automation::AutomationState::default(),
        ))
        .append_invoke_initialization_script(platform::interface_locale::initialization_script())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            let _ = account_automation::show_account_manager(app.clone());
        }))
        .manage(AppState::default())
        .manage(main_window::MainWindowStateCache::default())
        .manage(main_window::CloseBehaviorState::default())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .setup(move |app| {
            codex_home::initialize_paths(app.handle())?;
            storage::migrate_app_settings_for_version(app.handle())?;
            if let Err(error) = account_archive::folder_sync::retire_server_settings(app.handle()) {
                eprintln!("Could not clear retired sync settings: {error}");
            }
            let settings = storage::read_app_settings(app.handle())?;
            if let Err(error) = error_logs::setup(app.handle()) {
                eprintln!("failed to initialize error logs: {error}");
            }
            third_party_apps::capture_running_app_paths(app.handle());
            codex_home::initialize(&settings);
            main_window::configure_close_behavior(app.handle(), false);
            if let Err(error) = system_proxy::configure(&settings.network_proxy) {
                eprintln!("failed to restore the network proxy setting: {error}");
            }
            if !startup_smoke {
                if let Err(error) = autostart::restore_preference(app.handle()) {
                    eprintln!("failed to restore the startup setting: {error}");
                }
            }
            main_window::restore_or_set_default(app)?;
            commands::initialize_local_state(app.handle());
            account_automation::setup(app.handle())?;
            if !startup_smoke {
                account_archive::folder_sync::setup(app.handle())?;
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() == "main" {
                if matches!(
                    event,
                    tauri::WindowEvent::Moved(_) | tauri::WindowEvent::Resized(_)
                ) {
                    main_window::remember(window);
                }
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    main_window::remember_and_save(window);
                    if main_window::close_to_tray(window)
                        || account_automation::background_required(window.app_handle())
                        || account_archive::folder_sync::background_required()
                    {
                        api.prevent_close();
                        let _ = window.hide();
                    } else {
                        window.app_handle().exit(0);
                    }
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            account_archive::folder_sync::local_folder_sync,
            account_archive::portable::portable_account_backup,
            commands::get_app_info,
            commands::list_accounts,
            commands::import_local_auth_file,
            commands::switch_local_account,
            commands::load_account_health,
            commands::check_account_health,
            commands::delete_account,
            commands::refresh_usage,
            commands::launch_local_codex,
            account_automation::get_local_automation,
            account_automation::save_local_automation,
            account_automation::get_account_widget,
            account_automation::show_account_manager,
            account_automation::quit_interlude,
            account_automation::list_local_goals,
            account_automation::token_history::get_native_token_history,
            oauth::start_login,
            oauth::cancel_login,
            account_recovery::saved_login_settings,
            account_recovery::read_authenticator_import,
            floating_bubble::set_app_language,
        ])
        .build(context)
        .unwrap_or_else(|error| {
            eprintln!("failed to start Interlude: {error}");
            std::process::exit(1);
        })
        .run(|app, event| {
            #[cfg(target_os = "macos")]
            if matches!(event, tauri::RunEvent::Reopen { .. }) {
                let _ = account_automation::show_account_manager(app.clone());
            }
            if let tauri::RunEvent::ExitRequested { .. } = event {
                // Window move/resize events keep this cache current. Reading the
                // native window again while macOS is tearing it down can return a
                // transient, much smaller frame and corrupt the persisted size.
                if let Err(error) = main_window::save_cached(app) {
                    eprintln!("failed to save main window state before exit: {error}");
                }
            }
        });
}
