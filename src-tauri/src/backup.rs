use std::path::Path;
use std::time::Duration;

use rusqlite::{backup::Backup, Connection};

use crate::error::AppResult;

/// 预埋 SQLite Backup API。阶段 1 不提供用户向恢复点。
#[allow(dead_code)]
pub fn backup_connection(src: &Connection, dest: &Path) -> AppResult<()> {
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let mut dst = Connection::open(dest)?;
    let backup = Backup::new(src, &mut dst)?;
    backup.run_to_completion(5, Duration::from_millis(25), None)?;
    Ok(())
}
