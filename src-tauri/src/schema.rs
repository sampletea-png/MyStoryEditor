use rusqlite::Connection;

use crate::error::AppResult;

pub const USER_VERSION: i32 = 1;
pub const DOCUMENT_SCHEMA_VERSION: i32 = 1;
pub const EMPTY_DOCUMENT: &str = r#"{"type":"doc","content":[{"type":"paragraph"}]}"#;

pub fn initialize_work_db(conn: &Connection) -> AppResult<bool> {
    conn.execute_batch(
        r#"
        PRAGMA foreign_keys = ON;
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS volumes (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            sort_order INTEGER NOT NULL,
            deleted_at INTEGER
        );
        CREATE TABLE IF NOT EXISTS chapters (
            id TEXT PRIMARY KEY,
            volume_id TEXT,
            title TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT '初稿',
            body_json TEXT NOT NULL,
            document_schema_version INTEGER NOT NULL DEFAULT 1,
            word_count INTEGER NOT NULL DEFAULT 0,
            sort_order INTEGER NOT NULL,
            cursor_from INTEGER NOT NULL DEFAULT 1,
            cursor_to INTEGER NOT NULL DEFAULT 1,
            scroll_top REAL NOT NULL DEFAULT 0,
            deleted_at INTEGER,
            FOREIGN KEY(volume_id) REFERENCES volumes(id)
        );
        CREATE TABLE IF NOT EXISTS session (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        "#,
    )?;
    conn.pragma_update(None, "user_version", USER_VERSION)?;
    ensure_fts5(conn)
}

pub fn ensure_fts5(conn: &Connection) -> AppResult<bool> {
    let exists: bool = conn.query_row(
        "SELECT COUNT(*) > 0 FROM sqlite_master WHERE name = 'chapter_fts'",
        [],
        |row| row.get(0),
    )?;
    if exists {
        return Ok(true);
    }
    if conn
        .execute_batch(
            "CREATE VIRTUAL TABLE chapter_fts USING fts5(chapter_id UNINDEXED, title, body, tokenize='trigram');",
        )
        .is_ok()
    {
        return Ok(true);
    }
    conn.execute_batch(
        "CREATE VIRTUAL TABLE chapter_fts USING fts5(chapter_id UNINDEXED, title, body);",
    )?;
    Ok(true)
}

pub fn fts5_available(conn: &Connection) -> AppResult<bool> {
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM sqlite_master WHERE name = 'chapter_fts' AND type = 'table'",
        [],
        |row| row.get(0),
    )?;
    Ok(count > 0)
}
