use std::fs::{self, File, OpenOptions};
use std::path::{Path, PathBuf};

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

use crate::backup::backup_connection;
use crate::error::{AppError, AppResult};
use crate::prefs::{folder_name_from_work_name, unique_folder_name};
use crate::schema::{
    ensure_schema, fts5_available, initialize_work_db, DOCUMENT_SCHEMA_VERSION, EMPTY_DOCUMENT,
};
use crate::setting::SettingCatalogDto;

pub const RECYCLE_DIR: &str = "作品库回收区";
pub const RESTORE_SUFFIX: &str = ".恢复点";
pub const WORK_ALREADY_OPEN: &str = "该作品已在其他窗口打开";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkManifest {
    pub id: String,
    pub name: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkSummary {
    pub id: String,
    pub name: String,
    pub folder_name: String,
    pub path: String,
    pub recycled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VolumeDto {
    pub id: String,
    pub title: String,
    pub sort_order: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChapterDto {
    pub id: String,
    pub volume_id: Option<String>,
    pub title: String,
    pub status: String,
    pub sort_order: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OutlineDto {
    pub volumes: Vec<VolumeDto>,
    pub chapters: Vec<ChapterDto>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionDto {
    pub chapter_id: Option<String>,
    pub cursor_from: i64,
    pub cursor_to: i64,
    pub scroll_top: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChapterBodyDto {
    pub id: String,
    pub title: String,
    pub status: String,
    pub body: Value,
    pub document_schema_version: i64,
    pub word_count: i64,
    pub cursor_from: i64,
    pub cursor_to: i64,
    pub scroll_top: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenedWorkDto {
    pub work: WorkSummary,
    pub outline: OutlineDto,
    pub session: SessionDto,
    pub chapter: Option<ChapterBodyDto>,
    pub work_word_count: i64,
    pub fts5: bool,
    pub catalog: SettingCatalogDto,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveChapterPayload {
    pub id: String,
    pub title: String,
    pub body: Value,
    pub cursor_from: i64,
    pub cursor_to: i64,
    pub scroll_top: f64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateChapterOptions {
    pub after_chapter_id: Option<String>,
    pub selected_volume_id: Option<String>,
}

pub struct WorkPackage {
    pub path: PathBuf,
    pub manifest: WorkManifest,
    pub(crate) conn: Connection,
    _lock: File,
}

impl WorkPackage {
    pub fn create(library: &Path, name: &str) -> AppResult<Self> {
        if name.trim().is_empty() {
            return Err(AppError::Message("新建作品时名称必填".into()));
        }
        fs::create_dir_all(library)?;
        let existing = existing_folder_names(library)?;
        let folder = unique_folder_name(name, &existing);
        let path = library.join(&folder);
        fs::create_dir_all(path.join("assets"))?;
        let now = now_iso();
        let manifest = WorkManifest {
            id: Uuid::new_v4().to_string(),
            name: name.trim().to_string(),
            created_at: now.clone(),
            updated_at: now,
        };
        write_manifest(&path, &manifest)?;
        let conn = Connection::open(path.join("work.sqlite"))?;
        let fts5 = initialize_work_db(&conn)?;
        if !fts5 {
            return Err(AppError::Message("捆绑 SQLite 无法创建 FTS5 表".into()));
        }
        let lock = acquire_package_lock(&path)?;
        let package = Self {
            path,
            manifest,
            conn,
            _lock: lock,
        };
        let chapter_id = Uuid::new_v4().to_string();
        package.conn.execute(
            "INSERT INTO chapters (id, volume_id, title, status, body_json, document_schema_version, word_count, sort_order)
             VALUES (?1, NULL, '第一章', '初稿', ?2, ?3, 0, 0)",
            params![chapter_id, EMPTY_DOCUMENT, DOCUMENT_SCHEMA_VERSION],
        )?;
        package.upsert_fts(&chapter_id, "第一章", "")?;
        package.set_session_value("last_chapter_id", &chapter_id)?;
        package.set_session_value("cursor_from", "1")?;
        package.set_session_value("cursor_to", "1")?;
        package.set_session_value("scroll_top", "0")?;
        Ok(package)
    }

    pub fn open(path: &Path) -> AppResult<Self> {
        let manifest = read_manifest(path)?;
        let lock = acquire_package_lock(path)?;
        let conn = Connection::open(path.join("work.sqlite"))?;
        conn.execute_batch("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;")?;
        ensure_schema(&conn)?;
        Ok(Self {
            path: path.to_path_buf(),
            manifest,
            conn,
            _lock: lock,
        })
    }

    pub fn summary(&self, recycled: bool) -> WorkSummary {
        WorkSummary {
            id: self.manifest.id.clone(),
            name: self.manifest.name.clone(),
            folder_name: self
                .path
                .file_name()
                .map(|name| name.to_string_lossy().into_owned())
                .unwrap_or_default(),
            path: self.path.to_string_lossy().into_owned(),
            recycled,
        }
    }

    pub fn opened(&self) -> AppResult<OpenedWorkDto> {
        let outline = self.outline()?;
        let session = self.session()?;
        let chapter = match &session.chapter_id {
            Some(id) => self.load_chapter(id).ok(),
            None => outline
                .chapters
                .first()
                .and_then(|item| self.load_chapter(&item.id).ok()),
        };
        Ok(OpenedWorkDto {
            work: self.summary(false),
            outline,
            session,
            chapter,
            work_word_count: self.work_word_count()?,
            fts5: fts5_available(&self.conn)?,
            catalog: self.catalog()?,
        })
    }

    pub fn outline(&self) -> AppResult<OutlineDto> {
        let mut volumes = Vec::new();
        let mut stmt = self.conn.prepare(
            "SELECT id, title, sort_order FROM volumes WHERE deleted_at IS NULL ORDER BY sort_order",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(VolumeDto {
                id: row.get(0)?,
                title: row.get(1)?,
                sort_order: row.get(2)?,
            })
        })?;
        for row in rows {
            volumes.push(row?);
        }
        let mut chapters = Vec::new();
        let mut stmt = self.conn.prepare(
            "SELECT id, volume_id, title, status, sort_order FROM chapters WHERE deleted_at IS NULL ORDER BY sort_order",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(ChapterDto {
                id: row.get(0)?,
                volume_id: row.get(1)?,
                title: row.get(2)?,
                status: row.get(3)?,
                sort_order: row.get(4)?,
            })
        })?;
        for row in rows {
            chapters.push(row?);
        }
        Ok(OutlineDto { volumes, chapters })
    }

    pub fn session(&self) -> AppResult<SessionDto> {
        Ok(SessionDto {
            chapter_id: self.get_session_value("last_chapter_id")?,
            cursor_from: self
                .get_session_value("cursor_from")?
                .and_then(|value| value.parse().ok())
                .unwrap_or(1),
            cursor_to: self
                .get_session_value("cursor_to")?
                .and_then(|value| value.parse().ok())
                .unwrap_or(1),
            scroll_top: self
                .get_session_value("scroll_top")?
                .and_then(|value| value.parse().ok())
                .unwrap_or(0.0),
        })
    }

    pub fn load_chapter(&self, id: &str) -> AppResult<ChapterBodyDto> {
        let chapter = self.conn.query_row(
            "SELECT id, title, status, body_json, document_schema_version, word_count, cursor_from, cursor_to, scroll_top
             FROM chapters WHERE id = ?1 AND deleted_at IS NULL",
            [id],
            |row| {
                let body: String = row.get(3)?;
                Ok(ChapterBodyDto {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    status: row.get(2)?,
                    body: serde_json::from_str(&body).unwrap_or(Value::Null),
                    document_schema_version: row.get(4)?,
                    word_count: row.get(5)?,
                    cursor_from: row.get(6)?,
                    cursor_to: row.get(7)?,
                    scroll_top: row.get(8)?,
                })
            },
        )?;
        self.set_session_value("last_chapter_id", id)?;
        Ok(chapter)
    }

    pub fn save_chapter(&self, payload: &SaveChapterPayload) -> AppResult<(i64, i64)> {
        let word_count = count_document_words(&payload.body);
        let body = serde_json::to_string(&payload.body)?;
        let changed = self.conn.execute(
            "UPDATE chapters
             SET title = ?1, body_json = ?2, word_count = ?3, cursor_from = ?4, cursor_to = ?5, scroll_top = ?6
             WHERE id = ?7 AND deleted_at IS NULL",
            params![
                payload.title,
                body,
                word_count,
                payload.cursor_from,
                payload.cursor_to,
                payload.scroll_top,
                payload.id
            ],
        )?;
        if changed == 0 {
            return Err(AppError::Message("找不到这一章".into()));
        }
        self.upsert_fts(&payload.id, &payload.title, &extract_plain_text(&payload.body))?;
        self.set_session_value("last_chapter_id", &payload.id)?;
        self.set_session_value("cursor_from", &payload.cursor_from.to_string())?;
        self.set_session_value("cursor_to", &payload.cursor_to.to_string())?;
        self.set_session_value("scroll_top", &payload.scroll_top.to_string())?;
        Ok((word_count, self.work_word_count()?))
    }

    pub fn create_volume(&self, title: &str) -> AppResult<OutlineDto> {
        let volume_count: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM volumes WHERE deleted_at IS NULL",
            [],
            |row| row.get(0),
        )?;
        let id = Uuid::new_v4().to_string();
        self.conn.execute(
            "INSERT INTO volumes (id, title, sort_order) VALUES (?1, ?2, ?3)",
            params![id, title, volume_count],
        )?;
        if volume_count == 0 {
            self.conn.execute(
                "UPDATE chapters SET volume_id = ?1 WHERE deleted_at IS NULL",
                [&id],
            )?;
        }
        self.outline()
    }

    pub fn cancel_volumes(&self) -> AppResult<OutlineDto> {
        self.conn.execute("UPDATE chapters SET volume_id = NULL WHERE deleted_at IS NULL", [])?;
        self.conn.execute("UPDATE volumes SET deleted_at = ?1 WHERE deleted_at IS NULL", [now_ts()])?;
        self.outline()
    }

    pub fn create_chapter(&self, options: &CreateChapterOptions) -> AppResult<(OutlineDto, ChapterBodyDto)> {
        let volumes: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM volumes WHERE deleted_at IS NULL",
            [],
            |row| row.get(0),
        )?;
        let (volume_id, sort_order) = self.placement(volumes > 0, options)?;
        if volumes > 0 && volume_id.is_some() {
            self.conn.execute(
                "UPDATE chapters SET sort_order = sort_order + 1
                 WHERE deleted_at IS NULL AND volume_id IS ?1 AND sort_order >= ?2",
                params![volume_id, sort_order],
            )?;
        } else if volumes == 0 {
            self.conn.execute(
                "UPDATE chapters SET sort_order = sort_order + 1
                 WHERE deleted_at IS NULL AND volume_id IS NULL AND sort_order >= ?1",
                [sort_order],
            )?;
        }
        let id = Uuid::new_v4().to_string();
        self.conn.execute(
            "INSERT INTO chapters (id, volume_id, title, status, body_json, document_schema_version, word_count, sort_order)
             VALUES (?1, ?2, '', '初稿', ?3, ?4, 0, ?5)",
            params![id, volume_id, EMPTY_DOCUMENT, DOCUMENT_SCHEMA_VERSION, sort_order],
        )?;
        self.upsert_fts(&id, "", "")?;
        self.set_session_value("last_chapter_id", &id)?;
        Ok((self.outline()?, self.load_chapter(&id)?))
    }

    pub fn rename_volume(&self, id: &str, title: &str) -> AppResult<OutlineDto> {
        self.conn.execute(
            "UPDATE volumes SET title = ?1 WHERE id = ?2 AND deleted_at IS NULL",
            params![title, id],
        )?;
        self.outline()
    }

    pub fn rename_chapter(&self, id: &str, title: &str) -> AppResult<OutlineDto> {
        self.conn.execute(
            "UPDATE chapters SET title = ?1 WHERE id = ?2 AND deleted_at IS NULL",
            params![title, id],
        )?;
        self.outline()
    }

    pub fn delete_volume(&self, id: &str) -> AppResult<OutlineDto> {
        let ts = now_ts();
        self.conn.execute(
            "UPDATE chapters SET deleted_at = ?1 WHERE volume_id = ?2 AND deleted_at IS NULL",
            params![ts, id],
        )?;
        self.conn.execute(
            "UPDATE volumes SET deleted_at = ?1 WHERE id = ?2 AND deleted_at IS NULL",
            params![ts, id],
        )?;
        self.outline()
    }

    pub fn delete_chapter(&self, id: &str) -> AppResult<OutlineDto> {
        self.conn.execute(
            "UPDATE chapters SET deleted_at = ?1 WHERE id = ?2 AND deleted_at IS NULL",
            params![now_ts(), id],
        )?;
        self.outline()
    }

    pub fn move_chapter(&self, id: &str, direction: &str) -> AppResult<OutlineDto> {
        let (volume_id, sort_order): (Option<String>, i64) = self.conn.query_row(
            "SELECT volume_id, sort_order FROM chapters WHERE id = ?1 AND deleted_at IS NULL",
            [id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )?;
        let target = if direction == "up" {
            self.conn.query_row(
                "SELECT id, sort_order FROM chapters
                 WHERE deleted_at IS NULL AND volume_id IS ?1 AND sort_order < ?2
                 ORDER BY sort_order DESC LIMIT 1",
                params![volume_id, sort_order],
                |row| Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?)),
            )
        } else {
            self.conn.query_row(
                "SELECT id, sort_order FROM chapters
                 WHERE deleted_at IS NULL AND volume_id IS ?1 AND sort_order > ?2
                 ORDER BY sort_order ASC LIMIT 1",
                params![volume_id, sort_order],
                |row| Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?)),
            )
        }
        .optional()?;
        if let Some((other_id, other_order)) = target {
            self.conn.execute(
                "UPDATE chapters SET sort_order = ?1 WHERE id = ?2",
                params![other_order, id],
            )?;
            self.conn.execute(
                "UPDATE chapters SET sort_order = ?1 WHERE id = ?2",
                params![sort_order, other_id],
            )?;
        }
        self.outline()
    }

    pub fn set_chapter_status(&self, id: &str, status: &str) -> AppResult<()> {
        if !matches!(status, "初稿" | "修订中" | "定稿") {
            return Err(AppError::Message("未知的章节状态".into()));
        }
        self.conn.execute(
            "UPDATE chapters SET status = ?1 WHERE id = ?2 AND deleted_at IS NULL",
            params![status, id],
        )?;
        Ok(())
    }

    pub fn rename_work(&mut self, name: &str) -> AppResult<()> {
        self.manifest.name = name.to_string();
        self.manifest.updated_at = now_iso();
        write_manifest(&self.path, &self.manifest)
    }

    #[allow(dead_code)]
    pub fn backup_to(&self, dest: &Path) -> AppResult<()> {
        backup_connection(&self.conn, dest)
    }

    pub fn export_archive(&self) -> AppResult<Vec<u8>> {
        use std::io::{Cursor, Write};
        use zip::write::SimpleFileOptions;

        let mut cursor = Cursor::new(Vec::new());
        {
            let mut zip = zip::ZipWriter::new(&mut cursor);
            let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
            zip.start_file("work.json", options)?;
            zip.write_all(&fs::read(self.path.join("work.json"))?)?;

            let tmp = std::env::temp_dir().join(format!("storyarchive-{}.sqlite", Uuid::new_v4()));
            self.backup_to(&tmp)?;
            zip.start_file("work.sqlite", options)?;
            zip.write_all(&fs::read(&tmp)?)?;
            let _ = fs::remove_file(&tmp);

            add_dir_to_zip(&mut zip, &self.path.join("assets"), "assets", options)?;
            zip.finish()?;
        }
        Ok(cursor.into_inner())
    }

    pub fn import_archive(library: &Path, bytes: &[u8]) -> AppResult<Self> {
        use std::io::{Cursor, Read};

        let mut zip = zip::ZipArchive::new(Cursor::new(bytes))?;
        let names: Vec<String> = {
            let mut names = Vec::new();
            for i in 0..zip.len() {
                names.push(zip.by_index(i)?.name().replace('\\', "/"));
            }
            names
        };
        if !names.iter().any(|name| name == "work.json") {
            return Err(AppError::Message("归档缺少 work.json".into()));
        }
        if !names.iter().any(|name| name == "work.sqlite") {
            return Err(AppError::Message("归档缺少 work.sqlite".into()));
        }

        let mut manifest: WorkManifest = {
            let mut file = zip.by_name("work.json")?;
            let mut text = String::new();
            file.read_to_string(&mut text)?;
            serde_json::from_str(&text)?
        };
        manifest.id = Uuid::new_v4().to_string();

        fs::create_dir_all(library)?;
        let existing = existing_folder_names(library)?;
        let folder = unique_folder_name(&manifest.name, &existing);
        let dest = library.join(&folder);
        fs::create_dir_all(dest.join("assets"))?;

        for i in 0..zip.len() {
            let mut file = zip.by_index(i)?;
            let name = file.name().replace('\\', "/");
            if name.contains("..") || name.contains("恢复点") || name == "work.json" {
                continue;
            }
            let dest_path = if name == "work.sqlite" {
                dest.join("work.sqlite")
            } else if let Some(rest) = name.strip_prefix("assets/") {
                if rest.is_empty() {
                    continue;
                }
                dest.join("assets").join(rest)
            } else {
                continue;
            };
            if file.is_dir() {
                fs::create_dir_all(&dest_path)?;
                continue;
            }
            if let Some(parent) = dest_path.parent() {
                fs::create_dir_all(parent)?;
            }
            let mut out = fs::File::create(&dest_path)?;
            std::io::copy(&mut file, &mut out)?;
        }
        write_manifest(&dest, &manifest)?;
        Self::open(&dest)
    }

    fn placement(
        &self,
        has_volumes: bool,
        options: &CreateChapterOptions,
    ) -> AppResult<(Option<String>, i64)> {
        if let Some(after_id) = options.after_chapter_id.as_deref().filter(|id| !id.is_empty()) {
            if let Ok((volume_id, sort_order)) = self.conn.query_row(
                "SELECT volume_id, sort_order FROM chapters WHERE id = ?1 AND deleted_at IS NULL",
                [after_id],
                |row| Ok((row.get::<_, Option<String>>(0)?, row.get::<_, i64>(1)?)),
            ) {
                return Ok((volume_id, sort_order + 1));
            }
        }
        let volume_id = if has_volumes {
            options
                .selected_volume_id
                .clone()
                .or_else(|| {
                    self.conn
                        .query_row(
                            "SELECT id FROM volumes WHERE deleted_at IS NULL ORDER BY sort_order LIMIT 1",
                            [],
                            |row| row.get(0),
                        )
                        .ok()
                })
        } else {
            None
        };
        let next: i64 = self.conn.query_row(
            "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM chapters WHERE deleted_at IS NULL AND volume_id IS ?1",
            params![volume_id],
            |row| row.get(0),
        )?;
        Ok((volume_id, next))
    }

    fn work_word_count(&self) -> AppResult<i64> {
        Ok(self.conn.query_row(
            "SELECT COALESCE(SUM(word_count), 0) FROM chapters WHERE deleted_at IS NULL",
            [],
            |row| row.get(0),
        )?)
    }

    fn upsert_fts(&self, chapter_id: &str, title: &str, body: &str) -> AppResult<()> {
        if !fts5_available(&self.conn)? {
            return Ok(());
        }
        self.conn.execute("DELETE FROM chapter_fts WHERE chapter_id = ?1", [chapter_id])?;
        self.conn.execute(
            "INSERT INTO chapter_fts (chapter_id, title, body) VALUES (?1, ?2, ?3)",
            params![chapter_id, title, body],
        )?;
        Ok(())
    }

    fn get_session_value(&self, key: &str) -> AppResult<Option<String>> {
        Ok(self
            .conn
            .query_row("SELECT value FROM session WHERE key = ?1", [key], |row| row.get(0))
            .optional()?)
    }

    fn set_session_value(&self, key: &str, value: &str) -> AppResult<()> {
        self.conn.execute(
            "INSERT INTO session (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![key, value],
        )?;
        Ok(())
    }
}

pub fn read_manifest(path: &Path) -> AppResult<WorkManifest> {
    let text = fs::read_to_string(path.join("work.json"))?;
    Ok(serde_json::from_str(&text)?)
}

pub fn write_manifest(path: &Path, manifest: &WorkManifest) -> AppResult<()> {
    fs::write(path.join("work.json"), serde_json::to_string_pretty(manifest)?)?;
    Ok(())
}

pub fn is_work_package(path: &Path) -> bool {
    path.join("work.json").is_file() && path.join("work.sqlite").is_file()
}

pub fn package_lock_path(work_dir: &Path) -> PathBuf {
    let mut path = work_dir.as_os_str().to_owned();
    path.push(".lock");
    PathBuf::from(path)
}

fn acquire_package_lock(work_dir: &Path) -> AppResult<File> {
    let lock_path = package_lock_path(work_dir);
    let mut options = OpenOptions::new();
    options.read(true).write(true).create(true);
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        options.share_mode(0);
    }
    match options.open(&lock_path) {
        Ok(file) => Ok(file),
        Err(err) if is_already_open_io(&err) => Err(AppError::Message(WORK_ALREADY_OPEN.into())),
        Err(err) => Err(err.into()),
    }
}

fn is_already_open_io(err: &std::io::Error) -> bool {
    #[cfg(windows)]
    {
        err.raw_os_error() == Some(32)
    }
    #[cfg(not(windows))]
    {
        matches!(
            err.kind(),
            std::io::ErrorKind::WouldBlock | std::io::ErrorKind::PermissionDenied
        )
    }
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

fn add_dir_to_zip<W: std::io::Write + std::io::Seek>(
    zip: &mut zip::ZipWriter<W>,
    dir: &Path,
    prefix: &str,
    options: zip::write::SimpleFileOptions,
) -> AppResult<()> {
    use std::io::Write;

    zip.add_directory(format!("{prefix}/"), options)?;
    if !dir.is_dir() {
        return Ok(());
    }
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let name = entry.file_name();
        let rel = format!("{prefix}/{}", name.to_string_lossy());
        if name.to_string_lossy().contains("恢复点") {
            continue;
        }
        if entry.file_type()?.is_dir() {
            add_dir_to_zip(zip, &entry.path(), &rel, options)?;
        } else {
            zip.start_file(&rel, options)?;
            zip.write_all(&fs::read(entry.path())?)?;
        }
    }
    Ok(())
}

fn existing_folder_names(library: &Path) -> AppResult<Vec<String>> {
    let mut names = Vec::new();
    if !library.is_dir() {
        return Ok(names);
    }
    for entry in fs::read_dir(library)? {
        let entry = entry?;
        if entry.file_type()?.is_dir() {
            names.push(entry.file_name().to_string_lossy().to_lowercase());
        }
    }
    Ok(names)
}

fn now_iso() -> String {
    chrono::Local::now().to_rfc3339()
}

pub(crate) fn now_ts() -> i64 {
    chrono::Local::now().timestamp()
}

pub fn count_words(text: &str) -> i64 {
    text.chars()
        .filter(|ch| !matches!(ch, '\t' | '\n' | '\r' | '\u{3000}'))
        .count() as i64
}

pub fn extract_plain_text(node: &Value) -> String {
    if let Some(text) = node.get("text").and_then(Value::as_str) {
        return text.to_string();
    }
    if node.get("type").and_then(Value::as_str) == Some("hardBreak") {
        return "\n".to_string();
    }
    let children = node
        .get("content")
        .and_then(Value::as_array)
        .map(|items| items.iter().map(extract_plain_text).collect::<String>())
        .unwrap_or_default();
    match node.get("type").and_then(Value::as_str) {
        Some("paragraph") | Some("horizontalRule") => format!("{children}\n"),
        _ => children,
    }
}

pub fn count_document_words(node: &Value) -> i64 {
    count_words(&extract_plain_text(node))
}

#[allow(dead_code)]
pub fn folder_name_preview(name: &str) -> String {
    folder_name_from_work_name(name)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn counts_hello_world_example_as_eleven() {
        assert_eq!(count_words("你好，世界 Hello"), 11);
    }

    #[test]
    fn create_work_confirms_fts5_and_keeps_chapter_after_reopen() {
        let dir = tempdir().unwrap();
        let created = WorkPackage::create(dir.path(), "北境行纪").unwrap();
        assert!(fts5_available(&created.conn).unwrap());
        let chapter = created.opened().unwrap().chapter.unwrap();
        assert_eq!(chapter.title, "第一章");
        let body = serde_json::json!({
            "type": "doc",
            "content": [{
                "type": "paragraph",
                "content": [{ "type": "text", "text": "还能看见" }]
            }]
        });
        created
            .save_chapter(&SaveChapterPayload {
                id: chapter.id.clone(),
                title: chapter.title.clone(),
                body,
                cursor_from: 3,
                cursor_to: 3,
                scroll_top: 12.0,
            })
            .unwrap();
        let path = created.path.clone();
        drop(created);
        let reopened = WorkPackage::open(&path).unwrap();
        let opened = reopened.opened().unwrap();
        assert_eq!(opened.session.cursor_from, 3);
        assert_eq!(opened.session.scroll_top, 12.0);
        let text = extract_plain_text(&opened.chapter.unwrap().body);
        assert!(text.contains("还能看见"));
    }

    #[test]
    fn first_volume_absorbs_existing_chapters() {
        let dir = tempdir().unwrap();
        let work = WorkPackage::create(dir.path(), "北境行纪").unwrap();
        let outline = work.create_volume("上卷").unwrap();
        assert_eq!(outline.volumes.len(), 1);
        assert!(outline.chapters.iter().all(|chapter| chapter.volume_id.is_some()));
    }

    #[test]
    fn backup_api_can_copy_an_open_database() {
        let dir = tempdir().unwrap();
        let work = WorkPackage::create(dir.path(), "北境行纪").unwrap();
        let dest = dir.path().join("probe.sqlite");
        work.backup_to(&dest).unwrap();
        assert!(dest.is_file());
        let probe = Connection::open(dest).unwrap();
        let count: i64 = probe
            .query_row("SELECT COUNT(*) FROM chapters", [], |row| row.get(0))
            .unwrap();
        assert!(count >= 1);
    }

    #[test]
    fn second_open_of_same_package_is_not_writable() {
        let dir = tempdir().unwrap();
        let first = WorkPackage::create(dir.path(), "北境行纪").unwrap();
        let err = match WorkPackage::open(&first.path) {
            Ok(_) => panic!("second open must fail"),
            Err(err) => err,
        };
        assert!(
            err.to_string().contains("已在其他窗口打开"),
            "unexpected error: {err}"
        );
        first
            .conn
            .execute("UPDATE chapters SET title = '仍可写' WHERE sort_order = 0", [])
            .unwrap();
    }

    #[test]
    fn dropping_the_holder_releases_the_package_lock() {
        let dir = tempdir().unwrap();
        let first = WorkPackage::create(dir.path(), "北境行纪").unwrap();
        let path = first.path.clone();
        drop(first);
        let reopened = WorkPackage::open(&path).unwrap();
        reopened
            .conn
            .execute("UPDATE chapters SET title = '锁已释放' WHERE sort_order = 0", [])
            .unwrap();
        let title: String = reopened
            .conn
            .query_row("SELECT title FROM chapters WHERE sort_order = 0", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(title, "锁已释放");
    }

    #[test]
    fn hold_work_lock_child() {
        let Ok(path) = std::env::var("STORY_EDITOR_HOLD_WORK_LOCK") else {
            return;
        };
        let ready = std::env::var("STORY_EDITOR_HOLD_READY").expect("ready path");
        let _package = WorkPackage::open(std::path::Path::new(&path)).expect("child open");
        std::fs::write(&ready, "ok").expect("signal ready");
        std::thread::park();
    }

    #[test]
    fn killed_process_releases_exclusive_work_lock() {
        let dir = tempdir().unwrap();
        let created = WorkPackage::create(dir.path(), "北境行纪").unwrap();
        let path = created.path.clone();
        drop(created);

        let ready = dir.path().join("holder.ready");
        let mut child = std::process::Command::new(std::env::current_exe().unwrap())
            .arg("--exact")
            .arg("work::tests::hold_work_lock_child")
            .env("STORY_EDITOR_HOLD_WORK_LOCK", &path)
            .env("STORY_EDITOR_HOLD_READY", &ready)
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn()
            .expect("spawn lock holder");

        let started = std::time::Instant::now();
        while !ready.is_file() {
            if started.elapsed() > std::time::Duration::from_secs(15) {
                let _ = child.kill();
                panic!("lock holder child did not become ready");
            }
            if let Ok(Some(status)) = child.try_wait() {
                panic!("lock holder child exited early: {status}");
            }
            std::thread::sleep(std::time::Duration::from_millis(20));
        }

        match WorkPackage::open(&path) {
            Ok(_) => {
                let _ = child.kill();
                panic!("second process must not open while holder is alive");
            }
            Err(err) => assert!(
                err.to_string().contains("已在其他窗口打开"),
                "unexpected error: {err}"
            ),
        }

        child.kill().expect("kill holder");
        child.wait().expect("wait holder");

        let started = std::time::Instant::now();
        let reopened = loop {
            match WorkPackage::open(&path) {
                Ok(package) => break package,
                Err(err) if started.elapsed() < std::time::Duration::from_secs(5) => {
                    let _ = err;
                    std::thread::sleep(std::time::Duration::from_millis(20));
                }
                Err(err) => panic!("lock should release after process death: {err}"),
            }
        };
        reopened
            .conn
            .execute("UPDATE chapters SET title = '进程死后可写' WHERE sort_order = 0", [])
            .unwrap();
    }

    #[test]
    fn storyarchive_is_zip_without_restore_points_and_imports_as_new_identity() {
        use crate::library;
        use crate::link::{CreateAssociationPayload, LinkRefDto};
        use crate::setting::LocationDto;
        use std::io::Cursor;
        use zip::ZipArchive;

        let source_lib = tempdir().unwrap();
        let work = WorkPackage::create(source_lib.path(), "北境行纪").unwrap();
        let chapter = work.opened().unwrap().chapter.unwrap();
        work.create_volume("上卷").unwrap();
        work.save_chapter(&SaveChapterPayload {
            id: chapter.id.clone(),
            title: "出关".into(),
            body: serde_json::json!({
                "type": "doc",
                "content": [{
                    "type": "paragraph",
                    "content": [{ "type": "text", "text": "雪停之后他才出关" }]
                }]
            }),
            cursor_from: 1,
            cursor_to: 1,
            scroll_top: 0.0,
        })
        .unwrap();
        let character = work.create_character().unwrap();
        work.save_character(&crate::setting::CharacterDto {
            id: character.id.clone(),
            name: "阿宁".into(),
            aliases: vec![],
            summary: "守关人".into(),
            appearance: serde_json::json!({"type":"doc","content":[{"type":"paragraph"}]}),
            personality: serde_json::json!({"type":"doc","content":[{"type":"paragraph"}]}),
            background: serde_json::json!({"type":"doc","content":[{"type":"paragraph"}]}),
        })
        .unwrap();
        work.create_association(&CreateAssociationPayload {
            left: LinkRefDto {
                kind: "chapter".into(),
                id: chapter.id.clone(),
            },
            right: LinkRefDto {
                kind: "character".into(),
                id: character.id.clone(),
            },
            note: "同乡".into(),
        })
        .unwrap();
        let city = work.create_location(None).unwrap();
        work.save_location(&LocationDto {
            id: city.id.clone(),
            name: "北城".into(),
            summary: String::new(),
            description: serde_json::json!({"type":"doc","content":[{"type":"paragraph"}]}),
            parent_id: None,
        })
        .unwrap();
        work.delete_location(&city.id).unwrap();
        fs::write(work.path.join("assets").join("cover.txt"), "封面").unwrap();
        let restore = restore_points_dir(&work.path);
        fs::create_dir_all(&restore).unwrap();
        fs::write(restore.join("should-not-export"), "恢复点").unwrap();

        let original_id = work.manifest.id.clone();
        let archive = work.export_archive().unwrap();
        let mut zip = ZipArchive::new(Cursor::new(&archive)).unwrap();
        let names: Vec<String> = (0..zip.len()).map(|i| zip.by_index(i).unwrap().name().to_string()).collect();
        assert!(names.iter().any(|name| name == "work.json"));
        assert!(names.iter().any(|name| name == "work.sqlite"));
        assert!(names.iter().any(|name| name == "assets/cover.txt" || name == "assets\\cover.txt"));
        assert!(names.iter().all(|name| !name.contains("恢复点") && !name.contains("should-not-export")));

        let dest_lib = tempdir().unwrap();
        WorkPackage::create(dest_lib.path(), "北境行纪").unwrap();
        let imported = WorkPackage::import_archive(dest_lib.path(), &archive).unwrap();
        assert_ne!(imported.manifest.id, original_id);
        assert_eq!(imported.manifest.name, "北境行纪");
        let opened = imported.opened().unwrap();
        assert_eq!(opened.outline.volumes[0].title, "上卷");
        assert_eq!(opened.chapter.as_ref().unwrap().title, "出关");
        assert!(extract_plain_text(&opened.chapter.as_ref().unwrap().body).contains("雪停之后他才出关"));
        assert_eq!(opened.catalog.characters[0].name, "阿宁");
        assert!(opened.catalog.locations.iter().all(|item| item.id != city.id));
        let links = imported.list_associations("chapter", &chapter.id).unwrap();
        assert_eq!(links.len(), 1);
        assert_eq!(links[0].note, "同乡");
        assert!(imported
            .list_recycle()
            .unwrap()
            .iter()
            .any(|item| item.id == city.id && item.kind == "location"));
        let listed = library::list_works(dest_lib.path(), false).unwrap();
        assert_eq!(listed.iter().filter(|item| item.name == "北境行纪").count(), 2);
        assert_eq!(
            listed.iter().map(|item| item.id.as_str()).collect::<std::collections::HashSet<_>>().len(),
            2
        );
    }
}
