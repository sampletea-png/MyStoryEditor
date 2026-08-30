use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

use crate::error::{AppError, AppResult};
use crate::schema::{DOCUMENT_SCHEMA_VERSION, EMPTY_DOCUMENT, UNCATEGORIZED_ID};
use crate::work::{now_ts, OutlineDto, WorkPackage};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingCategoryDto {
    pub id: String,
    pub name: String,
    pub sort_order: i64,
    pub system: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CharacterDto {
    pub id: String,
    pub name: String,
    pub aliases: Vec<String>,
    pub summary: String,
    pub appearance: Value,
    pub personality: Value,
    pub background: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocationDto {
    pub id: String,
    pub name: String,
    pub summary: String,
    pub description: Value,
    pub parent_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EventDto {
    pub id: String,
    pub name: String,
    pub summary: String,
    pub description: Value,
    pub story_time: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StorylineDto {
    pub id: String,
    pub name: String,
    pub summary: String,
    pub event_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingEntryDto {
    pub id: String,
    pub name: String,
    pub category_id: String,
    pub summary: String,
    pub body: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingCatalogDto {
    pub categories: Vec<SettingCategoryDto>,
    pub characters: Vec<CharacterDto>,
    pub locations: Vec<LocationDto>,
    pub events: Vec<EventDto>,
    pub storylines: Vec<StorylineDto>,
    pub settings: Vec<SettingEntryDto>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecycleItemDto {
    pub id: String,
    pub kind: String,
    pub name: String,
    pub deleted_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreResultDto {
    pub catalog: SettingCatalogDto,
    pub outline: OutlineDto,
}

impl WorkPackage {
    pub fn catalog(&self) -> AppResult<SettingCatalogDto> {
        Ok(SettingCatalogDto {
            categories: self.list_categories()?,
            characters: self.list_characters()?,
            locations: self.list_locations()?,
            events: self.list_events()?,
            storylines: self.list_storylines()?,
            settings: self.list_setting_entries()?,
        })
    }

    pub fn create_character(&self) -> AppResult<CharacterDto> {
        let id = Uuid::new_v4().to_string();
        let sort = next_sort(&self.conn, "characters")?;
        self.conn.execute(
            "INSERT INTO characters (id, name, aliases_json, summary, appearance_json, personality_json, background_json, document_schema_version, sort_order)
             VALUES (?1, '', '[]', '', ?2, ?2, ?2, ?3, ?4)",
            params![id, EMPTY_DOCUMENT, DOCUMENT_SCHEMA_VERSION, sort],
        )?;
        self.load_character(&id)
    }

    pub fn save_character(&self, payload: &CharacterDto) -> AppResult<()> {
        let aliases = serde_json::to_string(&payload.aliases)?;
        let changed = self.conn.execute(
            "UPDATE characters
             SET name = ?1, aliases_json = ?2, summary = ?3, appearance_json = ?4, personality_json = ?5, background_json = ?6
             WHERE id = ?7 AND deleted_at IS NULL",
            params![
                payload.name,
                aliases,
                payload.summary,
                serde_json::to_string(&payload.appearance)?,
                serde_json::to_string(&payload.personality)?,
                serde_json::to_string(&payload.background)?,
                payload.id
            ],
        )?;
        if changed == 0 {
            return Err(AppError::Message("找不到这个角色".into()));
        }
        Ok(())
    }

    pub fn delete_character(&self, id: &str) -> AppResult<()> {
        soft_delete(&self.conn, "characters", id)
    }

    pub fn create_location(&self, parent_id: Option<String>) -> AppResult<LocationDto> {
        if let Some(parent) = parent_id.as_deref() {
            if !self.live_location_exists(parent)? {
                return Err(AppError::Message("找不到上级地点".into()));
            }
        }
        let id = Uuid::new_v4().to_string();
        let sort = next_sort(&self.conn, "locations")?;
        self.conn.execute(
            "INSERT INTO locations (id, name, summary, description_json, parent_id, document_schema_version, sort_order)
             VALUES (?1, '', '', ?2, ?3, ?4, ?5)",
            params![id, EMPTY_DOCUMENT, parent_id, DOCUMENT_SCHEMA_VERSION, sort],
        )?;
        self.load_location(&id)
    }

    pub fn save_location(&self, payload: &LocationDto) -> AppResult<SettingCatalogDto> {
        if self.would_create_location_cycle(&payload.id, payload.parent_id.as_deref())? {
            return Err(AppError::Message("地点不能形成环".into()));
        }
        let changed = self.conn.execute(
            "UPDATE locations SET name = ?1, summary = ?2, description_json = ?3, parent_id = ?4
             WHERE id = ?5 AND deleted_at IS NULL",
            params![
                payload.name,
                payload.summary,
                serde_json::to_string(&payload.description)?,
                payload.parent_id,
                payload.id
            ],
        )?;
        if changed == 0 {
            return Err(AppError::Message("找不到这个地点".into()));
        }
        self.catalog()
    }

    pub fn delete_location(&self, id: &str) -> AppResult<SettingCatalogDto> {
        let parent: Option<String> = self.conn.query_row(
            "SELECT parent_id FROM locations WHERE id = ?1 AND deleted_at IS NULL",
            [id],
            |row| row.get(0),
        )?;
        self.conn.execute(
            "UPDATE locations SET parent_id = ?1 WHERE parent_id = ?2 AND deleted_at IS NULL",
            params![parent, id],
        )?;
        soft_delete(&self.conn, "locations", id)?;
        self.catalog()
    }

    pub fn create_event(&self) -> AppResult<EventDto> {
        let id = Uuid::new_v4().to_string();
        let sort = next_sort(&self.conn, "events")?;
        self.conn.execute(
            "INSERT INTO events (id, name, summary, description_json, story_time, document_schema_version, sort_order)
             VALUES (?1, '', '', ?2, '', ?3, ?4)",
            params![id, EMPTY_DOCUMENT, DOCUMENT_SCHEMA_VERSION, sort],
        )?;
        self.load_event(&id)
    }

    pub fn save_event(&self, payload: &EventDto) -> AppResult<()> {
        let changed = self.conn.execute(
            "UPDATE events SET name = ?1, summary = ?2, description_json = ?3, story_time = ?4
             WHERE id = ?5 AND deleted_at IS NULL",
            params![
                payload.name,
                payload.summary,
                serde_json::to_string(&payload.description)?,
                payload.story_time,
                payload.id
            ],
        )?;
        if changed == 0 {
            return Err(AppError::Message("找不到这个事件".into()));
        }
        Ok(())
    }

    pub fn delete_event(&self, id: &str) -> AppResult<()> {
        soft_delete(&self.conn, "events", id)
    }

    pub fn create_storyline(&self) -> AppResult<StorylineDto> {
        let id = Uuid::new_v4().to_string();
        let sort = next_sort(&self.conn, "storylines")?;
        self.conn.execute(
            "INSERT INTO storylines (id, name, summary, sort_order) VALUES (?1, '', '', ?2)",
            params![id, sort],
        )?;
        self.load_storyline(&id)
    }

    pub fn save_storyline(&self, id: &str, name: &str, summary: &str) -> AppResult<()> {
        let changed = self.conn.execute(
            "UPDATE storylines SET name = ?1, summary = ?2 WHERE id = ?3 AND deleted_at IS NULL",
            params![name, summary, id],
        )?;
        if changed == 0 {
            return Err(AppError::Message("找不到这条故事线".into()));
        }
        Ok(())
    }

    pub fn delete_storyline(&self, id: &str) -> AppResult<()> {
        soft_delete(&self.conn, "storylines", id)
    }

    pub fn add_event_to_storyline(&self, storyline_id: &str, event_id: &str) -> AppResult<StorylineDto> {
        self.require_live("storylines", storyline_id, "找不到这条故事线")?;
        self.require_live("events", event_id, "找不到这个事件")?;
        let exists: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM storyline_events WHERE storyline_id = ?1 AND event_id = ?2",
            params![storyline_id, event_id],
            |row| row.get(0),
        )?;
        if exists == 0 {
            let sort: i64 = self.conn.query_row(
                "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM storyline_events WHERE storyline_id = ?1",
                [storyline_id],
                |row| row.get(0),
            )?;
            self.conn.execute(
                "INSERT INTO storyline_events (storyline_id, event_id, sort_order) VALUES (?1, ?2, ?3)",
                params![storyline_id, event_id, sort],
            )?;
        }
        self.load_storyline(storyline_id)
    }

    pub fn remove_event_from_storyline(
        &self,
        storyline_id: &str,
        event_id: &str,
    ) -> AppResult<StorylineDto> {
        self.conn.execute(
            "DELETE FROM storyline_events WHERE storyline_id = ?1 AND event_id = ?2",
            params![storyline_id, event_id],
        )?;
        self.load_storyline(storyline_id)
    }

    pub fn move_storyline_event(
        &self,
        storyline_id: &str,
        event_id: &str,
        direction: &str,
    ) -> AppResult<StorylineDto> {
        let current: i64 = self.conn.query_row(
            "SELECT sort_order FROM storyline_events WHERE storyline_id = ?1 AND event_id = ?2",
            params![storyline_id, event_id],
            |row| row.get(0),
        )?;
        let other = if direction == "up" {
            self.conn.query_row(
                "SELECT event_id, sort_order FROM storyline_events
                 WHERE storyline_id = ?1 AND sort_order < ?2 ORDER BY sort_order DESC LIMIT 1",
                params![storyline_id, current],
                |row| Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?)),
            )
        } else {
            self.conn.query_row(
                "SELECT event_id, sort_order FROM storyline_events
                 WHERE storyline_id = ?1 AND sort_order > ?2 ORDER BY sort_order ASC LIMIT 1",
                params![storyline_id, current],
                |row| Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?)),
            )
        }
        .optional()?;
        if let Some((other_id, other_order)) = other {
            self.conn.execute(
                "UPDATE storyline_events SET sort_order = ?1 WHERE storyline_id = ?2 AND event_id = ?3",
                params![other_order, storyline_id, event_id],
            )?;
            self.conn.execute(
                "UPDATE storyline_events SET sort_order = ?1 WHERE storyline_id = ?2 AND event_id = ?3",
                params![current, storyline_id, other_id],
            )?;
        }
        self.load_storyline(storyline_id)
    }

    pub fn create_setting_entry(&self, category_id: Option<String>) -> AppResult<SettingEntryDto> {
        let category = category_id.unwrap_or_else(|| UNCATEGORIZED_ID.to_string());
        self.require_category(&category)?;
        let id = Uuid::new_v4().to_string();
        let sort = next_sort(&self.conn, "setting_entries")?;
        self.conn.execute(
            "INSERT INTO setting_entries (id, name, category_id, summary, body_json, document_schema_version, sort_order)
             VALUES (?1, '', ?2, '', ?3, ?4, ?5)",
            params![id, category, EMPTY_DOCUMENT, DOCUMENT_SCHEMA_VERSION, sort],
        )?;
        self.load_setting_entry(&id)
    }

    pub fn save_setting_entry(&self, payload: &SettingEntryDto) -> AppResult<()> {
        self.require_category(&payload.category_id)?;
        let changed = self.conn.execute(
            "UPDATE setting_entries SET name = ?1, category_id = ?2, summary = ?3, body_json = ?4
             WHERE id = ?5 AND deleted_at IS NULL",
            params![
                payload.name,
                payload.category_id,
                payload.summary,
                serde_json::to_string(&payload.body)?,
                payload.id
            ],
        )?;
        if changed == 0 {
            return Err(AppError::Message("找不到这条设定".into()));
        }
        Ok(())
    }

    pub fn delete_setting_entry(&self, id: &str) -> AppResult<()> {
        soft_delete(&self.conn, "setting_entries", id)
    }

    pub fn create_category(&self, name: &str) -> AppResult<SettingCategoryDto> {
        let trimmed = name.trim();
        if trimmed.is_empty() {
            return Err(AppError::Message("分类名不能为空".into()));
        }
        if self.category_name_taken(trimmed, None)? {
            return Err(AppError::Message("同一作品内分类名不可重复".into()));
        }
        let id = Uuid::new_v4().to_string();
        let sort: i64 = self.conn.query_row(
            "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM setting_categories",
            [],
            |row| row.get(0),
        )?;
        self.conn.execute(
            "INSERT INTO setting_categories (id, name, sort_order, is_system) VALUES (?1, ?2, ?3, 0)",
            params![id, trimmed, sort],
        )?;
        Ok(SettingCategoryDto {
            id,
            name: trimmed.to_string(),
            sort_order: sort,
            system: false,
        })
    }

    pub fn rename_category(&self, id: &str, name: &str) -> AppResult<()> {
        self.forbid_uncategorized(id, "不能改名「未分类」")?;
        let trimmed = name.trim();
        if trimmed.is_empty() {
            return Err(AppError::Message("分类名不能为空".into()));
        }
        if self.category_name_taken(trimmed, Some(id))? {
            return Err(AppError::Message("同一作品内分类名不可重复".into()));
        }
        let changed = self.conn.execute(
            "UPDATE setting_categories SET name = ?1 WHERE id = ?2 AND is_system = 0",
            params![trimmed, id],
        )?;
        if changed == 0 {
            return Err(AppError::Message("找不到这个分类".into()));
        }
        Ok(())
    }

    pub fn delete_category(&self, id: &str) -> AppResult<SettingCatalogDto> {
        self.forbid_uncategorized(id, "无法删除「未分类」")?;
        self.conn.execute(
            "UPDATE setting_entries SET category_id = ?1 WHERE category_id = ?2",
            params![UNCATEGORIZED_ID, id],
        )?;
        let changed = self.conn.execute(
            "DELETE FROM setting_categories WHERE id = ?1 AND is_system = 0",
            [id],
        )?;
        if changed == 0 {
            return Err(AppError::Message("找不到这个分类".into()));
        }
        self.catalog()
    }

    pub fn list_recycle(&self) -> AppResult<Vec<RecycleItemDto>> {
        let mut items = Vec::new();
        push_recycle(
            &self.conn,
            &mut items,
            "SELECT id, title, deleted_at FROM volumes WHERE deleted_at IS NOT NULL",
            "volume",
        )?;
        push_recycle(
            &self.conn,
            &mut items,
            "SELECT id, title, deleted_at FROM chapters WHERE deleted_at IS NOT NULL",
            "chapter",
        )?;
        push_recycle(
            &self.conn,
            &mut items,
            "SELECT id, name, deleted_at FROM characters WHERE deleted_at IS NOT NULL",
            "character",
        )?;
        push_recycle(
            &self.conn,
            &mut items,
            "SELECT id, name, deleted_at FROM locations WHERE deleted_at IS NOT NULL",
            "location",
        )?;
        push_recycle(
            &self.conn,
            &mut items,
            "SELECT id, name, deleted_at FROM events WHERE deleted_at IS NOT NULL",
            "event",
        )?;
        push_recycle(
            &self.conn,
            &mut items,
            "SELECT id, name, deleted_at FROM storylines WHERE deleted_at IS NOT NULL",
            "storyline",
        )?;
        push_recycle(
            &self.conn,
            &mut items,
            "SELECT id, name, deleted_at FROM setting_entries WHERE deleted_at IS NOT NULL",
            "setting",
        )?;
        items.sort_by(|a, b| b.deleted_at.cmp(&a.deleted_at));
        Ok(items)
    }

    pub fn restore_recycle(&self, kind: &str, id: &str) -> AppResult<RestoreResultDto> {
        match kind {
            "volume" => self.restore_volume(id)?,
            "chapter" => self.restore_chapter(id)?,
            "character" => restore_row(&self.conn, "characters", id)?,
            "location" => self.restore_location(id)?,
            "event" => restore_row(&self.conn, "events", id)?,
            "storyline" => restore_row(&self.conn, "storylines", id)?,
            "setting" => restore_row(&self.conn, "setting_entries", id)?,
            _ => return Err(AppError::Message("未知的回收站类型".into())),
        }
        Ok(RestoreResultDto {
            catalog: self.catalog()?,
            outline: self.outline()?,
        })
    }

    pub fn permanently_delete_recycle(&self, kind: &str, id: &str) -> AppResult<()> {
        match kind {
            "volume" => {
                self.conn
                    .execute("DELETE FROM chapters WHERE volume_id = ?1 AND deleted_at IS NOT NULL", [id])?;
                self.conn.execute("DELETE FROM volumes WHERE id = ?1", [id])?;
            }
            "chapter" => {
                self.conn.execute("DELETE FROM chapters WHERE id = ?1", [id])?;
            }
            "character" => {
                self.conn.execute("DELETE FROM characters WHERE id = ?1", [id])?;
            }
            "location" => {
                self.conn
                    .execute("UPDATE locations SET parent_id = NULL WHERE parent_id = ?1", [id])?;
                self.conn.execute("DELETE FROM locations WHERE id = ?1", [id])?;
            }
            "event" => {
                self.conn
                    .execute("DELETE FROM storyline_events WHERE event_id = ?1", [id])?;
                self.conn.execute("DELETE FROM events WHERE id = ?1", [id])?;
            }
            "storyline" => {
                self.conn
                    .execute("DELETE FROM storyline_events WHERE storyline_id = ?1", [id])?;
                self.conn.execute("DELETE FROM storylines WHERE id = ?1", [id])?;
            }
            "setting" => {
                self.conn.execute("DELETE FROM setting_entries WHERE id = ?1", [id])?;
            }
            _ => return Err(AppError::Message("未知的回收站类型".into())),
        }
        Ok(())
    }

    fn list_categories(&self) -> AppResult<Vec<SettingCategoryDto>> {
        let mut stmt = self
            .conn
            .prepare("SELECT id, name, sort_order, is_system FROM setting_categories ORDER BY sort_order")?;
        let rows = stmt.query_map([], |row| {
            Ok(SettingCategoryDto {
                id: row.get(0)?,
                name: row.get(1)?,
                sort_order: row.get(2)?,
                system: row.get::<_, i64>(3)? != 0,
            })
        })?;
        collect_rows(rows)
    }

    fn list_characters(&self) -> AppResult<Vec<CharacterDto>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, name, aliases_json, summary, appearance_json, personality_json, background_json
             FROM characters WHERE deleted_at IS NULL ORDER BY sort_order",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(CharacterDto {
                id: row.get(0)?,
                name: row.get(1)?,
                aliases: parse_aliases(row.get::<_, String>(2)?),
                summary: row.get(3)?,
                appearance: parse_json(row.get(4)?),
                personality: parse_json(row.get(5)?),
                background: parse_json(row.get(6)?),
            })
        })?;
        collect_rows(rows)
    }

    fn list_locations(&self) -> AppResult<Vec<LocationDto>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, name, summary, description_json, parent_id
             FROM locations WHERE deleted_at IS NULL ORDER BY sort_order",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(LocationDto {
                id: row.get(0)?,
                name: row.get(1)?,
                summary: row.get(2)?,
                description: parse_json(row.get(3)?),
                parent_id: row.get(4)?,
            })
        })?;
        collect_rows(rows)
    }

    fn list_events(&self) -> AppResult<Vec<EventDto>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, name, summary, description_json, story_time
             FROM events WHERE deleted_at IS NULL ORDER BY sort_order",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(EventDto {
                id: row.get(0)?,
                name: row.get(1)?,
                summary: row.get(2)?,
                description: parse_json(row.get(3)?),
                story_time: row.get(4)?,
            })
        })?;
        collect_rows(rows)
    }

    fn list_storylines(&self) -> AppResult<Vec<StorylineDto>> {
        let mut stmt = self
            .conn
            .prepare("SELECT id, name, summary FROM storylines WHERE deleted_at IS NULL ORDER BY sort_order")?;
        let rows = stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?))
        })?;
        let mut storylines = Vec::new();
        for row in rows {
            let (id, name, summary) = row?;
            storylines.push(StorylineDto {
                event_ids: self.storyline_event_ids(&id)?,
                id,
                name,
                summary,
            });
        }
        Ok(storylines)
    }

    fn list_setting_entries(&self) -> AppResult<Vec<SettingEntryDto>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, name, category_id, summary, body_json
             FROM setting_entries WHERE deleted_at IS NULL ORDER BY sort_order",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(SettingEntryDto {
                id: row.get(0)?,
                name: row.get(1)?,
                category_id: row.get(2)?,
                summary: row.get(3)?,
                body: parse_json(row.get(4)?),
            })
        })?;
        collect_rows(rows)
    }

    fn load_character(&self, id: &str) -> AppResult<CharacterDto> {
        Ok(self.conn.query_row(
            "SELECT id, name, aliases_json, summary, appearance_json, personality_json, background_json
             FROM characters WHERE id = ?1 AND deleted_at IS NULL",
            [id],
            |row| {
                Ok(CharacterDto {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    aliases: parse_aliases(row.get::<_, String>(2)?),
                    summary: row.get(3)?,
                    appearance: parse_json(row.get(4)?),
                    personality: parse_json(row.get(5)?),
                    background: parse_json(row.get(6)?),
                })
            },
        )?)
    }

    fn load_location(&self, id: &str) -> AppResult<LocationDto> {
        Ok(self.conn.query_row(
            "SELECT id, name, summary, description_json, parent_id FROM locations WHERE id = ?1 AND deleted_at IS NULL",
            [id],
            |row| {
                Ok(LocationDto {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    summary: row.get(2)?,
                    description: parse_json(row.get(3)?),
                    parent_id: row.get(4)?,
                })
            },
        )?)
    }

    fn load_event(&self, id: &str) -> AppResult<EventDto> {
        Ok(self.conn.query_row(
            "SELECT id, name, summary, description_json, story_time FROM events WHERE id = ?1 AND deleted_at IS NULL",
            [id],
            |row| {
                Ok(EventDto {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    summary: row.get(2)?,
                    description: parse_json(row.get(3)?),
                    story_time: row.get(4)?,
                })
            },
        )?)
    }

    fn load_storyline(&self, id: &str) -> AppResult<StorylineDto> {
        let (name, summary): (String, String) = self.conn.query_row(
            "SELECT name, summary FROM storylines WHERE id = ?1 AND deleted_at IS NULL",
            [id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )?;
        Ok(StorylineDto {
            id: id.to_string(),
            name,
            summary,
            event_ids: self.storyline_event_ids(id)?,
        })
    }

    fn load_setting_entry(&self, id: &str) -> AppResult<SettingEntryDto> {
        Ok(self.conn.query_row(
            "SELECT id, name, category_id, summary, body_json FROM setting_entries WHERE id = ?1 AND deleted_at IS NULL",
            [id],
            |row| {
                Ok(SettingEntryDto {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    category_id: row.get(2)?,
                    summary: row.get(3)?,
                    body: parse_json(row.get(4)?),
                })
            },
        )?)
    }

    fn storyline_event_ids(&self, storyline_id: &str) -> AppResult<Vec<String>> {
        let mut stmt = self.conn.prepare(
            "SELECT event_id FROM storyline_events WHERE storyline_id = ?1 ORDER BY sort_order",
        )?;
        let rows = stmt.query_map([storyline_id], |row| row.get(0))?;
        collect_rows(rows)
    }

    fn live_location_exists(&self, id: &str) -> AppResult<bool> {
        let count: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM locations WHERE id = ?1 AND deleted_at IS NULL",
            [id],
            |row| row.get(0),
        )?;
        Ok(count > 0)
    }

    fn would_create_location_cycle(&self, id: &str, parent_id: Option<&str>) -> AppResult<bool> {
        let Some(mut current) = parent_id.map(str::to_string) else {
            return Ok(false);
        };
        if current == id {
            return Ok(true);
        }
        let mut seen = std::collections::HashSet::new();
        while !current.is_empty() {
            if current == id || !seen.insert(current.clone()) {
                return Ok(true);
            }
            current = self
                .conn
                .query_row(
                    "SELECT parent_id FROM locations WHERE id = ?1",
                    [&current],
                    |row| row.get::<_, Option<String>>(0),
                )?
                .unwrap_or_default();
        }
        Ok(false)
    }

    fn category_name_taken(&self, name: &str, except: Option<&str>) -> AppResult<bool> {
        let count: i64 = match except {
            Some(id) => self.conn.query_row(
                "SELECT COUNT(*) FROM setting_categories WHERE name = ?1 AND id != ?2",
                params![name, id],
                |row| row.get(0),
            )?,
            None => self.conn.query_row(
                "SELECT COUNT(*) FROM setting_categories WHERE name = ?1",
                [name],
                |row| row.get(0),
            )?,
        };
        Ok(count > 0)
    }

    fn require_category(&self, id: &str) -> AppResult<()> {
        let count: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM setting_categories WHERE id = ?1",
            [id],
            |row| row.get(0),
        )?;
        if count == 0 {
            return Err(AppError::Message("找不到这个分类".into()));
        }
        Ok(())
    }

    fn require_live(&self, table: &str, id: &str, message: &str) -> AppResult<()> {
        let sql = format!("SELECT COUNT(*) FROM {table} WHERE id = ?1 AND deleted_at IS NULL");
        let count: i64 = self.conn.query_row(&sql, [id], |row| row.get(0))?;
        if count == 0 {
            return Err(AppError::Message(message.into()));
        }
        Ok(())
    }

    fn forbid_uncategorized(&self, id: &str, message: &str) -> AppResult<()> {
        if id == UNCATEGORIZED_ID {
            return Err(AppError::Message(message.into()));
        }
        let system: i64 = self
            .conn
            .query_row(
                "SELECT is_system FROM setting_categories WHERE id = ?1",
                [id],
                |row| row.get(0),
            )
            .optional()?
            .unwrap_or(0);
        if system != 0 {
            return Err(AppError::Message(message.into()));
        }
        Ok(())
    }

    fn restore_volume(&self, id: &str) -> AppResult<()> {
        let deleted_at: i64 = self.conn.query_row(
            "SELECT deleted_at FROM volumes WHERE id = ?1 AND deleted_at IS NOT NULL",
            [id],
            |row| row.get(0),
        )?;
        self.conn.execute(
            "UPDATE chapters SET deleted_at = NULL WHERE volume_id = ?1 AND deleted_at = ?2",
            params![id, deleted_at],
        )?;
        restore_row(&self.conn, "volumes", id)
    }

    fn restore_chapter(&self, id: &str) -> AppResult<()> {
        let volume_id: Option<String> = self.conn.query_row(
            "SELECT volume_id FROM chapters WHERE id = ?1 AND deleted_at IS NOT NULL",
            [id],
            |row| row.get(0),
        )?;
        if let Some(volume) = volume_id {
            let live: i64 = self.conn.query_row(
                "SELECT COUNT(*) FROM volumes WHERE id = ?1 AND deleted_at IS NULL",
                [&volume],
                |row| row.get(0),
            )?;
            if live == 0 {
                self.conn
                    .execute("UPDATE chapters SET volume_id = NULL WHERE id = ?1", [id])?;
            }
        }
        restore_row(&self.conn, "chapters", id)
    }

    fn restore_location(&self, id: &str) -> AppResult<()> {
        let parent: Option<String> = self.conn.query_row(
            "SELECT parent_id FROM locations WHERE id = ?1 AND deleted_at IS NOT NULL",
            [id],
            |row| row.get(0),
        )?;
        if let Some(parent_id) = parent {
            if !self.live_location_exists(&parent_id)? {
                self.conn
                    .execute("UPDATE locations SET parent_id = NULL WHERE id = ?1", [id])?;
            }
        }
        restore_row(&self.conn, "locations", id)
    }
}

fn next_sort(conn: &rusqlite::Connection, table: &str) -> AppResult<i64> {
    let sql = format!("SELECT COALESCE(MAX(sort_order), -1) + 1 FROM {table} WHERE deleted_at IS NULL");
    Ok(conn.query_row(&sql, [], |row| row.get(0))?)
}

fn soft_delete(conn: &rusqlite::Connection, table: &str, id: &str) -> AppResult<()> {
    let sql = format!("UPDATE {table} SET deleted_at = ?1 WHERE id = ?2 AND deleted_at IS NULL");
    let changed = conn.execute(&sql, params![now_ts(), id])?;
    if changed == 0 {
        return Err(AppError::Message("找不到要删除的条目".into()));
    }
    Ok(())
}

fn restore_row(conn: &rusqlite::Connection, table: &str, id: &str) -> AppResult<()> {
    let sql = format!("UPDATE {table} SET deleted_at = NULL WHERE id = ?1 AND deleted_at IS NOT NULL");
    let changed = conn.execute(&sql, [id])?;
    if changed == 0 {
        return Err(AppError::Message("回收站里找不到这项".into()));
    }
    Ok(())
}

fn push_recycle(
    conn: &rusqlite::Connection,
    items: &mut Vec<RecycleItemDto>,
    sql: &str,
    kind: &str,
) -> AppResult<()> {
    let mut stmt = conn.prepare(sql)?;
    let rows = stmt.query_map([], |row| {
        Ok(RecycleItemDto {
            id: row.get(0)?,
            kind: kind.to_string(),
            name: row.get(1)?,
            deleted_at: row.get(2)?,
        })
    })?;
    for row in rows {
        items.push(row?);
    }
    Ok(())
}

fn parse_json(text: String) -> Value {
    serde_json::from_str(&text).unwrap_or(Value::Null)
}

fn parse_aliases(text: String) -> Vec<String> {
    serde_json::from_str(&text).unwrap_or_default()
}

fn collect_rows<T, E>(rows: impl Iterator<Item = Result<T, E>>) -> AppResult<Vec<T>>
where
    E: Into<AppError>,
{
    let mut items = Vec::new();
    for row in rows {
        items.push(row.map_err(Into::into)?);
    }
    Ok(items)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::schema::{ensure_schema, initialize_work_db};
    use crate::work::{write_manifest, WorkManifest, WorkPackage};
    use rusqlite::Connection;
    use tempfile::tempdir;

    fn work(name: &str) -> (tempfile::TempDir, WorkPackage) {
        let dir = tempdir().unwrap();
        let created = WorkPackage::create(dir.path(), name).unwrap();
        (dir, created)
    }

    #[test]
    fn can_create_five_kinds_without_chapters() {
        let (_dir, work) = work("北境行纪");
        for chapter in work.outline().unwrap().chapters {
            work.delete_chapter(&chapter.id).unwrap();
        }
        assert!(work.outline().unwrap().chapters.is_empty());
        work.create_character().unwrap();
        work.create_location(None).unwrap();
        work.create_event().unwrap();
        work.create_storyline().unwrap();
        work.create_setting_entry(None).unwrap();
        let catalog = work.catalog().unwrap();
        assert_eq!(catalog.characters.len(), 1);
        assert_eq!(catalog.locations.len(), 1);
        assert_eq!(catalog.events.len(), 1);
        assert_eq!(catalog.storylines.len(), 1);
        assert_eq!(catalog.settings.len(), 1);
        assert!(catalog.categories.iter().any(|item| item.name == "未分类" && item.system));
    }

    #[test]
    fn deleting_faction_moves_entries_to_uncategorized() {
        let (_dir, work) = work("北境行纪");
        let entry = work.create_setting_entry(Some("preset-势力".into())).unwrap();
        assert_eq!(entry.category_id, "preset-势力");
        let catalog = work.delete_category("preset-势力").unwrap();
        assert_eq!(catalog.settings[0].category_id, UNCATEGORIZED_ID);
        assert!(catalog.categories.iter().all(|item| item.name != "势力"));
        assert!(work.delete_category(UNCATEGORIZED_ID).is_err());
    }

    #[test]
    fn removing_event_from_storyline_keeps_the_event() {
        let (_dir, work) = work("北境行纪");
        let event = work.create_event().unwrap();
        let line = work.create_storyline().unwrap();
        work.add_event_to_storyline(&line.id, &event.id).unwrap();
        work.add_event_to_storyline(&line.id, &event.id).unwrap();
        let after_add = work.load_storyline(&line.id).unwrap();
        assert_eq!(after_add.event_ids, vec![event.id.clone()]);
        let after_remove = work.remove_event_from_storyline(&line.id, &event.id).unwrap();
        assert!(after_remove.event_ids.is_empty());
        assert_eq!(work.catalog().unwrap().events.len(), 1);
    }

    #[test]
    fn deleting_location_promotes_children() {
        let (_dir, work) = work("北境行纪");
        let north = work.create_location(None).unwrap();
        let city = work.create_location(Some(north.id.clone())).unwrap();
        let inn = work.create_location(Some(city.id.clone())).unwrap();
        let catalog = work.delete_location(&city.id).unwrap();
        let inn = catalog.locations.iter().find(|item| item.id == inn.id).unwrap();
        assert_eq!(inn.parent_id.as_deref(), Some(north.id.as_str()));
        assert!(catalog.locations.iter().all(|item| item.id != city.id));
        work.restore_recycle("location", &city.id).unwrap();
        let recycled_gone = work
            .list_recycle()
            .unwrap()
            .into_iter()
            .all(|item| item.id != city.id);
        assert!(recycled_gone);
    }

    #[test]
    fn permanently_deleting_storyline_keeps_events() {
        let (_dir, work) = work("北境行纪");
        let event = work.create_event().unwrap();
        let line = work.create_storyline().unwrap();
        work.add_event_to_storyline(&line.id, &event.id).unwrap();
        work.delete_storyline(&line.id).unwrap();
        work.permanently_delete_recycle("storyline", &line.id).unwrap();
        assert_eq!(work.catalog().unwrap().events.len(), 1);
        assert!(work.catalog().unwrap().storylines.is_empty());
    }

    #[test]
    fn v1_work_migrates_preset_categories() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("旧作");
        std::fs::create_dir_all(path.join("assets")).unwrap();
        write_manifest(
            &path,
            &WorkManifest {
                id: "old".into(),
                name: "旧作".into(),
                created_at: "2020-01-01T00:00:00+08:00".into(),
                updated_at: "2020-01-01T00:00:00+08:00".into(),
            },
        )
        .unwrap();
        let conn = Connection::open(path.join("work.sqlite")).unwrap();
        initialize_work_db(&conn).unwrap();
        conn.execute_batch(
            "PRAGMA foreign_keys = OFF;
             DROP TABLE IF EXISTS setting_entries;
             DROP TABLE IF EXISTS storyline_events;
             DROP TABLE IF EXISTS storylines;
             DROP TABLE IF EXISTS events;
             DROP TABLE IF EXISTS locations;
             DROP TABLE IF EXISTS characters;
             DROP TABLE IF EXISTS setting_categories;
             PRAGMA foreign_keys = ON;",
        )
        .unwrap();
        conn.pragma_update(None, "user_version", 1).unwrap();
        drop(conn);
        let opened = WorkPackage::open(&path).unwrap();
        let names: Vec<_> = opened
            .catalog()
            .unwrap()
            .categories
            .into_iter()
            .map(|item| item.name)
            .collect();
        assert_eq!(names, vec!["未分类", "势力", "制度", "物种", "规则"]);
        assert!(ensure_schema(&opened.conn).unwrap());
    }
}
