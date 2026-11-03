use tauri::{Manager,WebviewUrl};

pub(crate) const LABEL:&str="account-widget";
pub(crate) fn open(app:&tauri::AppHandle)->Result<(),String> {
    if let Some(window)=app.get_webview_window(LABEL){return window.show().map_err(|_|"widgetFailed".into());}
    let mut builder=crate::webview_windows::builder(app,LABEL,WebviewUrl::App("index.html#account-widget".into()))
        .title("Interlude").inner_size(308.0,216.0).resizable(false).decorations(false)
        .always_on_top(true).skip_taskbar(true).focused(false);
    if let Ok(Some(monitor))=app.primary_monitor(){
        let area=monitor.work_area();let scale=monitor.scale_factor();
        let position=area.position.to_logical::<f64>(scale);let size=area.size.to_logical::<f64>(scale);
        builder=builder.position(position.x+(size.width-332.0).max(0.0),position.y+(size.height-240.0).max(0.0));
    }
    builder.build().map_err(|_|"widgetFailed")?;Ok(())
}
pub(crate) fn close(app:&tauri::AppHandle){
    if let Some(window)=app.get_webview_window(LABEL){let _=window.destroy();}
    if !super::background_required(app){let _=show_main(app);}
}
pub(crate) fn show_main(app:&tauri::AppHandle)->Result<(),String>{
    if let Some(window)=app.get_webview_window("main") {
        window.unminimize().map_err(|_|"widgetFailed")?;
        window.show().map_err(|_|"widgetFailed")?;
        window.set_focus().map_err(|_|"widgetFailed")?;
    }
    Ok(())
}
pub(crate) fn setup_tray(app:&tauri::AppHandle)->Result<(),String> {
    use tauri::{menu::{Menu,MenuItem},tray::TrayIconBuilder};
    // Product-native menu labels are passed through the shared generated copy adapter.
    let show=MenuItem::with_id(app,"interlude.open",crate::storage::native_text("显示窗口"),true,None::<&str>).map_err(|_|"widgetFailed")?;
    let quit=MenuItem::with_id(app,"interlude.quit",crate::storage::native_text("退出"),true,None::<&str>).map_err(|_|"widgetFailed")?;
    let menu=Menu::with_items(app,&[&show,&quit]).map_err(|_|"widgetFailed")?;
    let mut builder=TrayIconBuilder::with_id("interlude-accounts").tooltip("Interlude").menu(&menu).show_menu_on_left_click(true)
        .on_menu_event(|app,event|match event.id.as_ref(){"interlude.open"=>{let _=show_main(app);},"interlude.quit"=>app.exit(0),_=>{}});
    if let Some(icon)=app.default_window_icon(){builder=builder.icon(icon.clone());}
    builder.build(app).map_err(|_|"widgetFailed")?;Ok(())
}

#[cfg(windows)]
pub(crate) fn close_codex_directly()->Result<(),String> {
    crate::windows_client_processes::stop_desktop_processes().map_err(|_|"switchFailed".into())
}
#[cfg(not(windows))]
pub(crate) fn close_codex_directly()->Result<(),String>{Err("protocolUnavailable".into())}

pub(crate) fn open_codex_thread(id:&str)->Result<(),String> {
    if uuid::Uuid::parse_str(id).is_err(){return Err("automationFailed".into());}
    #[cfg(windows)] {
        use std::os::windows::process::CommandExt;
        std::process::Command::new("explorer.exe").arg(format!("codex://threads/{id}")).creation_flags(0x08000000).spawn().map_err(|_|"automationFailed")?;
        Ok(())
    }
    #[cfg(not(windows))] {let _=id;Err("protocolUnavailable".into())}
}
