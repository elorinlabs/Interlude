#[tauri::command]
pub(crate) async fn get_native_token_history(
    app: tauri::AppHandle,
) -> Result<interlude_account_switch::token_history::History, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let home = super::goals::home(&app)?;
        Ok(interlude_account_switch::token_history::read_home(&home))
    })
    .await
    .map_err(|error| error.to_string())?
}
