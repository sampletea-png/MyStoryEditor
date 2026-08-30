use rusqlite::{params, Connection};

use crate::error::AppResult;

pub const USER_VERSION: i32 = 4;
pub const DOCUMENT_SCHEMA_VERSION: i32 = 1;
pub const EMPTY_DOCUMENT: &str = r#"{"type":"doc","content":[{"type":"paragraph"}]}"#;
pub const UNCATEGORIZED_ID: &str = "uncategorized";

const V1_TABLES: &str = r#"
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
        "#;

const V2_TABLES: &str = r#"
        CREATE TABLE IF NOT EXISTS setting_categories (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            sort_order INTEGER NOT NULL,
            is_system INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS characters (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            aliases_json TEXT NOT NULL DEFAULT '[]',
            summary TEXT NOT NULL DEFAULT '',
            appearance_json TEXT NOT NULL,
            personality_json TEXT NOT NULL,
            background_json TEXT NOT NULL,
            document_schema_version INTEGER NOT NULL DEFAULT 1,
            sort_order INTEGER NOT NULL,
            deleted_at INTEGER
        );
        CREATE TABLE IF NOT EXISTS locations (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            summary TEXT NOT NULL DEFAULT '',
            description_json TEXT NOT NULL,
            parent_id TEXT,
            document_schema_version INTEGER NOT NULL DEFAULT 1,
            sort_order INTEGER NOT NULL,
            deleted_at INTEGER
        );
        CREATE TABLE IF NOT EXISTS events (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            summary TEXT NOT NULL DEFAULT '',
            description_json TEXT NOT NULL,
            story_time TEXT NOT NULL DEFAULT '',
            document_schema_version INTEGER NOT NULL DEFAULT 1,
            sort_order INTEGER NOT NULL,
            deleted_at INTEGER
        );
        CREATE TABLE IF NOT EXISTS storylines (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            summary TEXT NOT NULL DEFAULT '',
            sort_order INTEGER NOT NULL,
            deleted_at INTEGER
        );
        CREATE TABLE IF NOT EXISTS storyline_events (
            storyline_id TEXT NOT NULL,
            event_id TEXT NOT NULL,
            sort_order INTEGER NOT NULL,
            PRIMARY KEY (storyline_id, event_id)
        );
        CREATE TABLE IF NOT EXISTS setting_entries (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            category_id TEXT NOT NULL,
            summary TEXT NOT NULL DEFAULT '',
            body_json TEXT NOT NULL,
            document_schema_version INTEGER NOT NULL DEFAULT 1,
            sort_order INTEGER NOT NULL,
            deleted_at INTEGER,
            FOREIGN KEY(category_id) REFERENCES setting_categories(id)
        );
        "#;

const V3_TABLES: &str = r#"
        CREATE TABLE IF NOT EXISTS associations (
            id TEXT PRIMARY KEY,
            left_kind TEXT NOT NULL,
            left_id TEXT NOT NULL,
            right_kind TEXT NOT NULL,
            right_id TEXT NOT NULL,
            note TEXT NOT NULL DEFAULT '',
            deleted_at INTEGER
        );
        CREATE UNIQUE INDEX IF NOT EXISTS associations_pair
            ON associations(left_kind, left_id, right_kind, right_id);
        "#;

const V4_TABLES: &str = r#"
        CREATE TABLE IF NOT EXISTS work_map (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            file_name TEXT NOT NULL,
            mime_type TEXT NOT NULL
        );
        "#;

pub fn initialize_work_db(conn: &Connection) -> AppResult<bool> {
    conn.execute_batch(V1_TABLES)?;
    migrate_v2_setting_tables(conn)?;
    migrate_v3_associations(conn)?;
    migrate_v4_work_map(conn)?;
    conn.pragma_update(None, "user_version", USER_VERSION)?;
    ensure_fts5(conn)
}

pub fn ensure_schema(conn: &Connection) -> AppResult<bool> {
    let version: i32 = conn.pragma_query_value(None, "user_version", |row| row.get(0))?;
    if version < 1 {
        return initialize_work_db(conn);
    }
    if version < 2 {
        migrate_v2_setting_tables(conn)?;
    }
    if version < 3 {
        migrate_v3_associations(conn)?;
    }
    if version < 4 {
        migrate_v4_work_map(conn)?;
    }
    conn.pragma_update(None, "user_version", USER_VERSION)?;
    ensure_fts5(conn)
}

fn migrate_v2_setting_tables(conn: &Connection) -> AppResult<()> {
    conn.execute_batch(V2_TABLES)?;
    seed_preset_categories(conn)
}

fn migrate_v3_associations(conn: &Connection) -> AppResult<()> {
    conn.execute_batch(V3_TABLES)?;
    Ok(())
}

fn migrate_v4_work_map(conn: &Connection) -> AppResult<()> {
    conn.execute_batch(V4_TABLES)?;
    Ok(())
}

fn seed_preset_categories(conn: &Connection) -> AppResult<()> {
    let presets = [
        (UNCATEGORIZED_ID, "未分类", 0, 1),
        ("preset-势力", "势力", 1, 0),
        ("preset-制度", "制度", 2, 0),
        ("preset-物种", "物种", 3, 0),
        ("preset-规则", "规则", 4, 0),
    ];
    for (id, name, order, system) in presets {
        conn.execute(
            "INSERT OR IGNORE INTO setting_categories (id, name, sort_order, is_system) VALUES (?1, ?2, ?3, ?4)",
            params![id, name, order, system],
        )?;
    }
    Ok(())
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
