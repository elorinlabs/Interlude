use super::{snapshot,update,AutomationState};
use std::{sync::{Arc,atomic::Ordering},time::Duration};
use serde_json::Value;
use tauri::{Emitter,Manager};
use interlude_account_switch::automation::{can_relay,has_quota,retry_delay};

fn now()->i64 {chrono::Utc::now().timestamp()}
fn quota(usage:&crate::models::UsageSummary)->bool {
    usage.error.is_none() && has_quota(usage.primary.as_ref().map(|window|window.remaining_percent),usage.secondary.as_ref().map(|window|window.remaining_percent))
}
fn reset_at(usage:&crate::models::UsageSummary)->Option<i64> {
    // A depleted weekly window must recover too, so wait for the last depleted window.
    [&usage.primary,&usage.secondary].into_iter().flatten().filter(|window|window.remaining_percent<=0.0).filter_map(|window|window.resets_at).max()
}
pub(crate) async fn run(app:tauri::AppHandle) {
    let refresh_app=app.clone();
    tauri::async_runtime::spawn(async move {refresh_loop(refresh_app).await;});
    let mut timer=tokio::time::interval(Duration::from_secs(10));
    timer.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
    loop {
        timer.tick().await;
        let relay_app=app.clone();
        let _=relay(&relay_app).await;
        let ids=snapshot(&app).config.preheat_ids;
        for id in ids {
            if snapshot(&app).plans.get(&id).is_some_and(|plan|plan.due(now())) {
                let _=preheat(&app,&id).await;
            }
        }
    }
}
async fn refresh_loop(app:tauri::AppHandle) {
    let mut failures=0_u32;
    loop {
        tokio::time::sleep(Duration::from_secs(5)).await;
        let managed=app.state::<Arc<AutomationState>>();
        if now()<managed.refresh_after.load(Ordering::Relaxed) {continue;}
        // One native coordinator owns refreshes even when several webviews are visible.
        managed.refresh_after.store(now()+60,Ordering::Relaxed);
        let worker=app.clone();
        let result=tauri::async_runtime::spawn_blocking(move|| {
            let _guard=crate::client_lifecycle::try_lock(crate::commands::account_switch_lock()).map_err(|_|"automationBusy")?;
            // Request loading adopts only newer credentials for the active identity.
            // Re-importing every minute can overwrite a newer managed login.
            let accounts=crate::commands::list_accounts_blocking(worker.clone())?;
            let Some(active)=accounts.into_iter().find(|account|account.active) else{return Ok(());};
            crate::commands::try_refresh_usage_blocking(&worker,&active.id)?;
            let _=worker.emit("accounts-changed",());
            Ok::<_,String>(())
        }).await;
        let successful=matches!(result,Ok(Ok(())));
        failures=if successful{0}else{failures.saturating_add(1)};
        let worker=app.clone();
        let _=tauri::async_runtime::spawn_blocking(move||update(&worker,|state| {
            state.refresh_status=if successful{"updated"}else{"refreshFailed"}.into();
            if successful{state.last_refresh_at=now();}
        })).await;
        let delay=if successful{60}else{retry_delay(failures)};
        managed.refresh_after.store(now()+delay,Ordering::Relaxed);
    }
}
async fn usage(app:&tauri::AppHandle,id:&str)->Result<crate::models::UsageSummary,String> {
    let worker=app.clone();let id=id.to_owned();
    tauri::async_runtime::spawn_blocking(move|| {
        let _guard=crate::client_lifecycle::try_lock(crate::commands::account_switch_lock()).map_err(|_|"automationBusy")?;
        let value=crate::commands::try_refresh_usage_blocking(&worker,&id)?;
        let _=worker.emit("accounts-changed",());Ok(value)
    }).await.map_err(|_|"automationFailed")?
}
async fn mutate(app:&tauri::AppHandle,change:impl FnOnce(&mut super::Stored)+Send+'static)->Result<(),String> {
    let app=app.clone();tauri::async_runtime::spawn_blocking(move||update(&app,change)).await.map_err(|_|"automationFailed")??;Ok(())
}
async fn preheat(app:&tauri::AppHandle,id:&str)->Result<(),String> {
    let checked=usage(app,id).await;
    let key=id.to_owned();
    let usage=match checked {
        Ok(value)=>value,
        Err(_)=>{return mutate(app,move|state|{if let Some(plan)=state.plans.get_mut(&key){plan.failed_probe(now());}}).await;}
    };
    let reset = usage.primary.as_ref().and_then(|window| window.resets_at);
    let observe_key = key.clone();
    let observe_app = app.clone();
    let ready = tauri::async_runtime::spawn_blocking(move || {
        let mut ready = false;
        update(&observe_app, |state| {
            if let Some(plan) = state.plans.get_mut(&observe_key) {
                ready = plan.observe_reset(now(), reset);
            }
        })?;
        Ok::<_, String>(ready)
    }).await.map_err(|_| "automationFailed")??;
    if !quota(&usage) {
        let reset=reset_at(&usage);
        return mutate(app,move|state|{if let Some(plan)=state.plans.get_mut(&key){plan.defer(now(),reset);}}).await;
    }
    if !ready { return Ok(()); }
    if !snapshot(app).config.preheat_ids.contains(&key){return Ok(());}
    let copy_app=app.clone();let copy_id=key.clone();
    let (original,source,temporary)=tauri::async_runtime::spawn_blocking(move|| {
        let paths=crate::storage::resolve_paths(&copy_app)?;
        let source=crate::storage::managed_auth_path(&paths,&copy_id);
        let parent=source.parent().ok_or("automationFailed")?.canonicalize().map_err(|_|"automationFailed")?;
        if !parent.starts_with(paths.accounts.canonicalize().map_err(|_|"automationFailed")?){return Err("automationFailed".into());}
        let original=crate::storage::read_json(&source)?;
        let clean=interlude_account_switch::sanitized_oauth(&original).map_err(|_|"automationFailed")?;
        let temporary=tempfile::tempdir().map_err(|_|"automationFailed")?;
        std::fs::write(temporary.path().join("auth.json"),serde_json::to_vec(&clean).map_err(|_|"automationFailed")?).map_err(|_|"automationFailed")?;
        Ok::<_,String>((original,source,temporary))
    }).await.map_err(|_|"automationFailed")??;
    let lease=key.clone();
    mutate(app,move|state|{if let Some(plan)=state.plans.get_mut(&lease){plan.begin();}}).await?;
    let result=super::rpc::greet(temporary.path(),||snapshot(app).config.preheat_ids.contains(&key)).await;
    // Copy back only refreshed standard credentials for this same unchanged account.
    if let Ok(bytes)=std::fs::read(temporary.path().join("auth.json")) {
        if let Ok(auth)=serde_json::from_slice::<Value>(&bytes) {
            let worker=app.clone();let write_id=key.clone();
            let _=tauri::async_runtime::spawn_blocking(move|| {
                let Ok(clean)=interlude_account_switch::sanitized_oauth(&auth) else{return;};
                let account=|value:&Value|value.pointer("/tokens/account_id").and_then(Value::as_str).map(str::to_owned);
                if account(&clean)!=account(&original){return;}
                let Ok(current)=crate::storage::read_json(&source) else{return;};
                if current!=original{return;}
                if let Ok(paths)=crate::storage::resolve_paths(&worker){let _=crate::storage::write_managed_auth_if_unchanged(&paths,&write_id,&original,&clean);}
            }).await;
        }
    }
    if let Err(error) = &result {
        eprintln!("automatic greeting failed for {key}: {error}");
    }
    mutate(app,move|state| {
        if let Some(plan)=state.plans.get_mut(&key) {
            match result {
                Ok(sent_at) => plan.sent(sent_at),
                Err(error) => plan.failed_send(now(), error),
            }
        }
    }).await
}

async fn relay(app:&tauri::AppHandle)->Result<(),String> {
    let saved=snapshot(app);
    let Some(config)=saved.config.relay else{return Ok(());};
    if now()<saved.relay_attempt_at+60{return Ok(());}
    let worker=app.clone();let id=config.thread_id.clone();
    let goal=tauri::async_runtime::spawn_blocking(move||super::goals::read_goal(&worker,&id)).await.map_err(|_|"goalsUnavailable")??;
    if Some(&goal.goal_id)!=saved.relay_goal_id.as_ref(){return mutate(app,|state|{state.relay_status="goalChanged".into();state.config.relay=None;}).await;}
    if matches!(goal.status.as_str(),"paused"|"complete"|"blocked"|"budget_limited") && saved.relay_phase.is_some() {
        return mutate(app,|state|{state.relay_phase=None;state.relay_target=None;state.relay_status="paused".into();}).await;
    }
    if saved.relay_phase.as_deref()!=Some("switched") && !can_relay(&goal.status,goal.tokens_used,goal.token_budget) {
        let status=match goal.status.as_str(){"complete"=>"complete","paused"=>"paused","blocked"=>"blocked","budget_limited"=>"budgetLimited",_=>"watching"};
        if saved.relay_status!=status {mutate(app,move|state|state.relay_status=status.into()).await?;}
        return Ok(());
    }
    mutate(app,|state|{state.relay_attempt_at=now();state.relay_status="checkingAccounts".into();}).await?;
    let selected=if saved.relay_phase.as_deref()==Some("switched") {saved.relay_target.clone()} else {
        let worker=app.clone();
        let accounts=tauri::async_runtime::spawn_blocking(move||crate::commands::list_accounts_blocking(worker)).await.map_err(|_|"automationFailed")??;
        let active=accounts.iter().find(|account|account.active).map(|account|account.id.as_str());
        if saved.relay_phase.as_deref()==Some("switching") && saved.relay_target.as_deref()==active {
            return mutate(app,|state|{state.relay_phase=Some("switched".into());state.relay_status="recovering".into();}).await;
        }
        let mut selected=None;
        for id in &config.account_ids {
            if Some(id.as_str())==active || !accounts.iter().any(|account|&account.id==id){continue;}
            if usage(app,id).await.is_ok_and(|value|quota(&value)){selected=Some(id.clone());break;}
        }
        selected
    };
    let Some(selected)=selected else{return mutate(app,|state|state.relay_status="waitingAccounts".into()).await;};
    let current=snapshot(app);
    if current.config.relay.as_ref().map(|value|&value.thread_id)!=Some(&config.thread_id){return Ok(());}
    if saved.relay_phase.as_deref()!=Some("switched") {
        let worker=app.clone();let target=selected.clone();let thread=config.thread_id.clone();let expected=goal.goal_id.clone();
        let result=tauri::async_runtime::spawn_blocking(move|| {
            let _guard=crate::client_lifecycle::try_lock(crate::commands::account_switch_lock()).map_err(|_|"automationBusy")?;
            let goal=super::goals::read_goal(&worker,&thread)?;
            if goal.goal_id!=expected || !can_relay(&goal.status,goal.tokens_used,goal.token_budget){return Err("goalChanged".into());}
            let paths=crate::storage::resolve_paths(&worker)?;
            interlude_account_switch::validate_switch(&interlude_account_switch::SwitchRequest{accounts:&paths.accounts,current_auth:&paths.current_auth,state:&paths.state_file,id:&target}).map_err(|_|"switchFailed")?;
            super::widget::close_codex_directly()?;
            if snapshot(&worker).config.relay.as_ref().map(|value|value.thread_id.as_str())!=Some(thread.as_str()){return Err("relayCancelled".into());}
            update(&worker,|state|{state.relay_phase=Some("switching".into());state.relay_target=Some(target.clone());state.relay_status="switching".into();})?;
            interlude_account_switch::switch_account(interlude_account_switch::SwitchRequest{accounts:&paths.accounts,current_auth:&paths.current_auth,state:&paths.state_file,id:&target}).map_err(|_|"switchFailed")?;
            update(&worker,|state|{state.relay_phase=Some("switched".into());state.relay_status="resuming".into();})?;
            let _=worker.emit("accounts-changed",());Ok::<_,String>(())
        }).await.map_err(|_|"automationFailed")?;
        if let Err(error)=result {
            return mutate(app,move|state|state.relay_status=match error.as_str(){"goalChanged"=>"goalChanged",_=>"relayFailed"}.into()).await;
        }
    }
    let home=super::goals::home(app)?;
    if snapshot(app).config.relay.as_ref().map(|value|value.thread_id.as_str())!=Some(config.thread_id.as_str()){return Ok(());}
    if goal.status=="active" && saved.relay_phase.as_deref()==Some("switched") {
        // A prior goal activation succeeded before shutdown interrupted its bookkeeping.
    } else if let Err(_error)=super::rpc::activate_goal(&home,&config.thread_id,&goal.goal_id).await {
        return mutate(app,|state|state.relay_status="resumeFailed".into()).await;
    }
    super::widget::open_codex_thread(&config.thread_id)?;
    mutate(app,|state|{state.relay_phase=None;state.relay_target=None;state.relay_status="watching".into();}).await
}
