//! Read goal metadata through a read-only connection. Goal mutations use Codex's own protocol.
use rusqlite::{Connection,OpenFlags};
use serde::Serialize;
use std::path::{Path,PathBuf};

#[derive(Clone,Serialize)]
#[serde(rename_all="camelCase")]
pub(crate) struct LocalGoal {
    pub thread_id:String, pub goal_id:String, pub objective:String, pub status:String,
    pub token_budget:Option<i64>, pub tokens_used:i64, pub title:String,
}
fn open(home:&Path)->Result<Connection,String> {
    let connection=Connection::open_with_flags(home.join("goals_1.sqlite"),OpenFlags::SQLITE_OPEN_READ_ONLY|OpenFlags::SQLITE_OPEN_NO_MUTEX).map_err(|_|"goalsUnavailable")?;
    connection.busy_timeout(std::time::Duration::from_secs(2)).map_err(|_|"goalsUnavailable")?;
    Ok(connection)
}
pub(crate) fn home(app:&tauri::AppHandle)->Result<PathBuf,String> {
    crate::storage::resolve_paths(app).map(|paths|paths.codex_home).map_err(|_|"goalsUnavailable".into())
}
pub(crate) fn list(app:&tauri::AppHandle)->Result<Vec<LocalGoal>,String> { list_home(&home(app)?) }
pub(crate) fn list_home(home:&Path)->Result<Vec<LocalGoal>,String> {
    let connection=open(home)?;
    let mut statement=connection.prepare("SELECT thread_id,goal_id,objective,status,token_budget,tokens_used FROM thread_goals ORDER BY updated_at_ms DESC LIMIT 200").map_err(|_|"goalsUnavailable")?;
    let mut goals=statement.query_map([],|row|Ok(LocalGoal{thread_id:row.get(0)?,goal_id:row.get(1)?,objective:row.get(2)?,status:row.get(3)?,token_budget:row.get(4)?,tokens_used:row.get(5)?,title:String::new()})).map_err(|_|"goalsUnavailable")?.collect::<Result<Vec<_>,_>>().map_err(|_|"goalsUnavailable")?;
    if let Ok(threads)=Connection::open_with_flags(home.join("state_5.sqlite"),OpenFlags::SQLITE_OPEN_READ_ONLY|OpenFlags::SQLITE_OPEN_NO_MUTEX) {
        let _=threads.busy_timeout(std::time::Duration::from_secs(2));
        for goal in &mut goals {
            goal.title=threads.query_row("SELECT title FROM threads WHERE id=?1",[&goal.thread_id],|row|row.get(0)).unwrap_or_default();
        }
    }
    Ok(goals)
}
pub(crate) fn read_goal(app:&tauri::AppHandle,id:&str)->Result<LocalGoal,String> {
    read_goal_home(&home(app)?,id)
}
pub(crate) fn read_goal_home(home:&Path,id:&str)->Result<LocalGoal,String> {
    let connection=open(home)?;
    connection.query_row("SELECT thread_id,goal_id,objective,status,token_budget,tokens_used FROM thread_goals WHERE thread_id=?1",[id],|row| {
        Ok(LocalGoal{thread_id:row.get(0)?,goal_id:row.get(1)?,objective:row.get(2)?,status:row.get(3)?,token_budget:row.get(4)?,tokens_used:row.get(5)?,title:String::new()})
    }).map_err(|_|"goalsUnavailable".into())
}
