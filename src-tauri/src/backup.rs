use std::fs;
use std::path::{Path, PathBuf};
use std::time::Duration;

use rusqlite::{backup::Backup, Connection};
use serde::{Deserialize, Serialize};

use crate::error::AppResult;
#[cfg(test)]
use crate::error::AppError;

pub const RESTORE_SUFFIX: &str = ".恢复点";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum RestoreKind {
    Manual,
    Auto,
    Migration,
}

impl RestoreKind {
    pub fn folder_label(self) -> &'static str {
        match self {
            Self::Manual => "手动",
            Self::Auto => "自动",
            Self::Migration => "迁移",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RestorePoint {
    pub path: PathBuf,
    pub folder_name: String,
    pub created_at: String,
    pub kind: RestoreKind,
}

/// 用 SQLite Backup API 把打开中的库写成一份一致的副本。
pub fn backup_connection(src: &Connection, dest: &Path) -> AppResult<()> {
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent)?;
    }
    let mut dst = Connection::open(dest)?;
    let backup = Backup::new(src, &mut dst)?;
    backup.run_to_completion(5, Duration::from_millis(25), None)?;
    Ok(())
}

pub fn create_restore_point(
    work_dir: &Path,
    src: &Connection,
    kind: RestoreKind,
) -> AppResult<RestorePoint> {
    let root = restore_points_dir(work_dir);
    fs::create_dir_all(&root)?;
    let created_at = chrono::Local::now().to_rfc3339();
    let stamp = chrono::Local::now().format("%Y-%m-%d_%H%M%S").to_string();
    let desired = format!("{stamp}-{}", kind.folder_label());
    let existing = existing_folder_names(&root)?;
    let folder_name = unique_restore_folder(&desired, &existing);
    let dest = root.join(&folder_name);
    fs::create_dir_all(dest.join("assets"))?;
    let manifest = work_dir.join("work.json");
    if manifest.is_file() {
        fs::copy(manifest, dest.join("work.json"))?;
    }
    copy_assets(&work_dir.join("assets"), &dest.join("assets"))?;
    backup_connection(src, &dest.join("work.sqlite"))?;
    Ok(RestorePoint {
        path: dest,
        folder_name,
        created_at,
        kind,
    })
}

pub fn is_inside_restore_points_dir(path: &Path) -> bool {
    path.parent()
        .and_then(|parent| parent.file_name())
        .and_then(|name| name.to_str())
        .is_some_and(|name| name.ends_with(RESTORE_SUFFIX))
}

pub fn restore_points_dir(work_dir: &Path) -> PathBuf {
    let name = work_dir
        .file_name()
        .map(|name| format!("{}{RESTORE_SUFFIX}", name.to_string_lossy()))
        .unwrap_or_else(|| format!("work{RESTORE_SUFFIX}"));
    work_dir
        .parent()
        .map(|parent| parent.join(name))
        .unwrap_or_else(|| work_dir.join(RESTORE_SUFFIX))
}

pub fn list_restore_points(work_dir: &Path) -> AppResult<Vec<RestorePoint>> {
    let root = restore_points_dir(work_dir);
    if !root.is_dir() {
        return Ok(Vec::new());
    }
    let mut points = Vec::new();
    for entry in fs::read_dir(&root)? {
        let entry = entry?;
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        if !path.join("work.json").is_file() || !path.join("work.sqlite").is_file() {
            continue;
        }
        let folder_name = entry.file_name().to_string_lossy().into_owned();
        let kind = kind_from_folder_name(&folder_name);
        let created_at = created_at_from_folder(&path, &folder_name);
        points.push(RestorePoint {
            path,
            folder_name,
            created_at,
            kind,
        });
    }
    points.sort_by(|a, b| {
        let ak = point_order(&a.folder_name);
        let bk = point_order(&b.folder_name);
        ak.0.cmp(&bk.0).then(a.created_at.cmp(&b.created_at)).then(ak.1.cmp(&bk.1))
    });
    Ok(points)
}

fn point_order(name: &str) -> (String, u64) {
    let stamp = name.chars().take(17).collect();
    let sequence = name.rsplit('-').next().and_then(|part| part.parse().ok()).unwrap_or(1);
    (stamp, sequence)
}

pub(crate) fn prune_automatic_points(work_dir: &Path) -> AppResult<()> {
    use std::collections::HashSet;
    let points = list_restore_points(work_dir)?;
    let automatic: Vec<_> = points.iter().rev().filter(|p| p.kind != RestoreKind::Manual).collect();
    let mut keep: HashSet<PathBuf> = automatic.iter().take(10).map(|p| p.path.clone()).collect();
    let mut days = HashSet::new();
    for point in &automatic {
        let day: String = point.folder_name.chars().take(10).collect();
        if days.len() < 7 && days.insert(day) {
            keep.insert(point.path.clone());
        }
    }
    for point in automatic {
        if !keep.contains(&point.path) {
            fs::remove_dir_all(&point.path)?;
        }
    }
    Ok(())
}

pub fn has_restore_point_on_local_date(work_dir: &Path, date: &str) -> AppResult<bool> {
    Ok(list_restore_points(work_dir)?
        .iter()
        .any(|point| point.folder_name.starts_with(date)))
}

fn kind_from_folder_name(name: &str) -> RestoreKind {
    if name.contains("迁移") {
        RestoreKind::Migration
    } else if name.contains("手动") {
        RestoreKind::Manual
    } else {
        RestoreKind::Auto
    }
}

fn created_at_from_folder(path: &Path, folder_name: &str) -> String {
    fs::metadata(path)
        .and_then(|meta| meta.created().or_else(|_| meta.modified()))
        .ok()
        .map(|time| {
            chrono::DateTime::<chrono::Local>::from(time).to_rfc3339()
        })
        .unwrap_or_else(|| folder_name.to_string())
}

fn existing_folder_names(dir: &Path) -> AppResult<Vec<String>> {
    let mut names = Vec::new();
    if !dir.is_dir() {
        return Ok(names);
    }
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        if entry.file_type()?.is_dir() {
            names.push(entry.file_name().to_string_lossy().to_lowercase());
        }
    }
    Ok(names)
}

fn unique_restore_folder(desired: &str, existing_lower: &[String]) -> String {
    let exists = |name: &str| existing_lower.iter().any(|item| item == &name.to_lowercase());
    if !exists(desired) {
        return desired.to_string();
    }
    let mut n = 2;
    loop {
        let candidate = format!("{desired}-{n}");
        if !exists(&candidate) {
            return candidate;
        }
        n += 1;
    }
}

pub(crate) fn copy_assets(source: &Path, dest: &Path) -> AppResult<()> {
    if !source.is_dir() {
        return Ok(());
    }
    fs::create_dir_all(dest)?;
    for entry in fs::read_dir(source)? {
        let entry = entry?;
        let to = dest.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_assets(&entry.path(), &to)?;
        } else {
            fs::copy(entry.path(), to)?;
        }
    }
    Ok(())
}

/// Test-only probe: a file-level copy of an open SQLite database must be rejected.
/// Production copies go through `backup_connection` (Backup API), never this path.
#[cfg(test)]
pub(crate) fn probe_hot_copy_of_open_sqlite(src: &Path, _dest: &Path) -> AppResult<()> {
    if sqlite_is_open(src) {
        return Err(AppError::Message(
            "打开中的库不能热拷贝，必须使用 Backup API 或 VACUUM INTO".into(),
        ));
    }
    Err(AppError::Message(
        "probe_hot_copy_of_open_sqlite only exercises the open-database deny path".into(),
    ))
}

#[cfg(test)]
fn sqlite_is_open(src: &Path) -> bool {
    wal_sidecar(src, "-wal").is_file() || wal_sidecar(src, "-shm").is_file()
}

#[cfg(test)]
fn wal_sidecar(src: &Path, suffix: &str) -> PathBuf {
    let mut name = src.as_os_str().to_os_string();
    name.push(suffix);
    PathBuf::from(name)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn hot_copy_of_open_database_is_rejected() {
        let dir = tempdir().unwrap();
        let src = dir.path().join("work.sqlite");
        let dest = dir.path().join("hot.sqlite");
        let conn = Connection::open(&src).unwrap();
        conn.execute_batch("PRAGMA journal_mode = WAL; CREATE TABLE t (id INTEGER); INSERT INTO t VALUES (1);")
            .unwrap();
        let err = probe_hot_copy_of_open_sqlite(&src, &dest).unwrap_err();
        let message = err.to_string();
        assert!(
            message.contains("Backup API") || message.contains("VACUUM INTO"),
            "{message}"
        );
        assert!(!dest.exists());
        drop(conn);
    }
}
