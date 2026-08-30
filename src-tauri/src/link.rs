use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::error::{AppError, AppResult};
use crate::schema::fts5_available;
use crate::work::{extract_plain_text, now_ts, WorkPackage};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinkRefDto {
    pub kind: String,
    pub id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssociationDto {
    pub id: String,
    pub left: LinkRefDto,
    pub right: LinkRefDto,
    pub note: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateAssociationPayload {
    pub left: LinkRefDto,
    pub right: LinkRefDto,
    pub note: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChapterHitDto {
    pub id: String,
    pub title: String,
    pub snippet: String,
    pub query: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingHitDto {
    pub kind: String,
    pub id: String,
    pub name: String,
    pub snippet: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResultsDto {
    pub chapters: Vec<ChapterHitDto>,
    pub settings: Vec<SettingHitDto>,
}

const LINKABLE: [&str; 5] = ["chapter", "character", "location", "event", "setting"];

impl WorkPackage {
    pub fn search_work(&self, query: &str) -> AppResult<SearchResultsDto> {
        let needle = query.trim();
        if needle.is_empty() {
            return Ok(SearchResultsDto {
                chapters: Vec::new(),
                settings: Vec::new(),
            });
        }
        Ok(SearchResultsDto {
            chapters: self.search_chapters(needle)?,
            settings: self.search_settings(needle)?,
        })
    }

    pub fn list_associations(&self, kind: &str, id: &str) -> AppResult<Vec<AssociationDto>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, left_kind, left_id, right_kind, right_id, note FROM associations
             WHERE deleted_at IS NULL
               AND ((left_kind = ?1 AND left_id = ?2) OR (right_kind = ?1 AND right_id = ?2))",
        )?;
        let rows = stmt.query_map(params![kind, id], |row| {
            Ok(AssociationDto {
                id: row.get(0)?,
                left: LinkRefDto {
                    kind: row.get(1)?,
                    id: row.get(2)?,
                },
                right: LinkRefDto {
                    kind: row.get(3)?,
                    id: row.get(4)?,
                },
                note: row.get(5)?,
            })
        })?;
        let mut items = Vec::new();
        for row in rows {
            let item = row?;
            if self.live_end(&item.left)? && self.live_end(&item.right)? {
                items.push(item);
            }
        }
        Ok(items)
    }

    pub fn create_association(&self, payload: &CreateAssociationPayload) -> AppResult<AssociationDto> {
        let left = validate_ref(&payload.left)?;
        let right = validate_ref(&payload.right)?;
        if left.kind == right.kind && left.id == right.id {
            return Err(AppError::Message("不能与自身建立关联".into()));
        }
        if !self.live_end(&left)? || !self.live_end(&right)? {
            return Err(AppError::Message("关联的两端必须都还在".into()));
        }
        let (left, right) = canonical(left, right);
        if let Some(existing) = self.find_pair(&left, &right)? {
            self.conn.execute(
                "UPDATE associations SET deleted_at = NULL, note = ?1 WHERE id = ?2",
                params![payload.note, existing.id],
            )?;
            return Ok(AssociationDto {
                id: existing.id,
                left,
                right,
                note: payload.note.clone(),
            });
        }
        let id = Uuid::new_v4().to_string();
        self.conn.execute(
            "INSERT INTO associations (id, left_kind, left_id, right_kind, right_id, note)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![id, left.kind, left.id, right.kind, right.id, payload.note],
        )?;
        Ok(AssociationDto {
            id,
            left,
            right,
            note: payload.note.clone(),
        })
    }

    pub fn update_association_note(&self, id: &str, note: &str) -> AppResult<()> {
        let changed = self.conn.execute(
            "UPDATE associations SET note = ?1 WHERE id = ?2 AND deleted_at IS NULL",
            params![note, id],
        )?;
        if changed == 0 {
            return Err(AppError::Message("找不到这条关联".into()));
        }
        Ok(())
    }

    pub fn delete_association(&self, id: &str) -> AppResult<()> {
        let changed = self.conn.execute(
            "UPDATE associations SET deleted_at = ?1 WHERE id = ?2 AND deleted_at IS NULL",
            params![now_ts(), id],
        )?;
        if changed == 0 {
            return Err(AppError::Message("找不到这条关联".into()));
        }
        Ok(())
    }

    pub fn drop_associations_for(&self, kind: &str, id: &str) -> AppResult<()> {
        self.conn.execute(
            "DELETE FROM associations WHERE (left_kind = ?1 AND left_id = ?2)
                 OR (right_kind = ?1 AND right_id = ?2)",
            params![kind, id],
        )?;
        Ok(())
    }

    fn search_chapters(&self, needle: &str) -> AppResult<Vec<ChapterHitDto>> {
        let like = format!("%{needle}%");
        let use_fallback = char_len(needle) <= 2 || !fts5_available(&self.conn)?;
        let mut ids = Vec::new();
        if !use_fallback {
            let mut stmt = self.conn.prepare(
                "SELECT chapter_id FROM chapter_fts WHERE chapter_fts MATCH ?1",
            )?;
            let rows = stmt.query_map([needle], |row| row.get::<_, String>(0));
            if let Ok(rows) = rows {
                for row in rows {
                    ids.push(row?);
                }
            }
        }
        if ids.is_empty() {
            let mut stmt = self.conn.prepare(
                "SELECT id FROM chapters
                 WHERE deleted_at IS NULL AND (title LIKE ?1 OR body_json LIKE ?1)
                 ORDER BY sort_order",
            )?;
            let rows = stmt.query_map([&like], |row| row.get::<_, String>(0))?;
            for row in rows {
                ids.push(row?);
            }
        }
        let mut hits = Vec::new();
        for id in ids {
            if let Ok(hit) = self.chapter_hit(&id, needle) {
                hits.push(hit);
            }
        }
        Ok(hits)
    }

    fn chapter_hit(&self, id: &str, needle: &str) -> AppResult<ChapterHitDto> {
        let (title, body_json): (String, String) = self.conn.query_row(
            "SELECT title, body_json FROM chapters WHERE id = ?1 AND deleted_at IS NULL",
            [id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )?;
        let body: serde_json::Value = serde_json::from_str(&body_json).unwrap_or(serde_json::Value::Null);
        let text = extract_plain_text(&body);
        let haystack = format!("{title}\n{text}");
        Ok(ChapterHitDto {
            id: id.to_string(),
            title,
            snippet: snippet_around(&haystack, needle),
            query: needle.to_string(),
        })
    }

    fn search_settings(&self, needle: &str) -> AppResult<Vec<SettingHitDto>> {
        let like = format!("%{needle}%");
        let mut hits = Vec::new();
        push_named_hits(
            &self.conn,
            &mut hits,
            "character",
            "SELECT id, name, aliases_json FROM characters WHERE deleted_at IS NULL AND (name LIKE ?1 OR aliases_json LIKE ?1 OR summary LIKE ?1)",
            &like,
        )?;
        push_named_hits(
            &self.conn,
            &mut hits,
            "location",
            "SELECT id, name, summary FROM locations WHERE deleted_at IS NULL AND (name LIKE ?1 OR summary LIKE ?1)",
            &like,
        )?;
        push_named_hits(
            &self.conn,
            &mut hits,
            "event",
            "SELECT id, name, summary FROM events WHERE deleted_at IS NULL AND (name LIKE ?1 OR summary LIKE ?1)",
            &like,
        )?;
        push_named_hits(
            &self.conn,
            &mut hits,
            "storyline",
            "SELECT id, name, summary FROM storylines WHERE deleted_at IS NULL AND (name LIKE ?1 OR summary LIKE ?1)",
            &like,
        )?;
        push_named_hits(
            &self.conn,
            &mut hits,
            "setting",
            "SELECT id, name, summary FROM setting_entries WHERE deleted_at IS NULL AND (name LIKE ?1 OR summary LIKE ?1)",
            &like,
        )?;
        Ok(hits)
    }

    fn live_end(&self, item: &LinkRefDto) -> AppResult<bool> {
        let table = match item.kind.as_str() {
            "chapter" => "chapters",
            "character" => "characters",
            "location" => "locations",
            "event" => "events",
            "setting" => "setting_entries",
            _ => return Ok(false),
        };
        let sql = format!("SELECT COUNT(*) FROM {table} WHERE id = ?1 AND deleted_at IS NULL");
        let count: i64 = self.conn.query_row(&sql, [&item.id], |row| row.get(0))?;
        Ok(count > 0)
    }

    fn find_pair(&self, left: &LinkRefDto, right: &LinkRefDto) -> AppResult<Option<AssociationDto>> {
        Ok(self
            .conn
            .query_row(
                "SELECT id, note FROM associations
                 WHERE left_kind = ?1 AND left_id = ?2 AND right_kind = ?3 AND right_id = ?4",
                params![left.kind, left.id, right.kind, right.id],
                |row| {
                    Ok(AssociationDto {
                        id: row.get(0)?,
                        left: left.clone(),
                        right: right.clone(),
                        note: row.get(1)?,
                    })
                },
            )
            .optional()?)
    }
}

fn validate_ref(item: &LinkRefDto) -> AppResult<LinkRefDto> {
    if !LINKABLE.contains(&item.kind.as_str()) {
        return Err(AppError::Message("故事线不进入通用关联".into()));
    }
    if item.id.trim().is_empty() {
        return Err(AppError::Message("关联对象不完整".into()));
    }
    Ok(item.clone())
}

fn kind_rank(kind: &str) -> i32 {
    match kind {
        "chapter" => 0,
        "character" => 1,
        "location" => 2,
        "event" => 3,
        "setting" => 4,
        _ => 9,
    }
}

fn canonical(a: LinkRefDto, b: LinkRefDto) -> (LinkRefDto, LinkRefDto) {
    if kind_rank(&a.kind) < kind_rank(&b.kind) || (a.kind == b.kind && a.id <= b.id) {
        (a, b)
    } else {
        (b, a)
    }
}

fn char_len(text: &str) -> usize {
    text.chars().count()
}

fn snippet_around(text: &str, needle: &str) -> String {
    let chars: Vec<char> = text.chars().collect();
    let lower: Vec<char> = text.to_lowercase().chars().collect();
    let needle_l: Vec<char> = needle.to_lowercase().chars().collect();
    if needle_l.is_empty() {
        return chars.into_iter().take(36).collect();
    }
    if let Some(index) = lower.windows(needle_l.len()).position(|window| window == needle_l.as_slice()) {
        let start = index.saturating_sub(18);
        let end = (index + needle_l.len() + 18).min(chars.len());
        let mut snippet: String = chars[start..end].iter().collect();
        if start > 0 {
            snippet = format!("…{snippet}");
        }
        if end < chars.len() {
            snippet.push('…');
        }
        return snippet;
    }
    chars.into_iter().take(36).collect()
}

fn push_named_hits(
    conn: &rusqlite::Connection,
    hits: &mut Vec<SettingHitDto>,
    kind: &str,
    sql: &str,
    like: &str,
) -> AppResult<()> {
    let mut stmt = conn.prepare(sql)?;
    let rows = stmt.query_map([like], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?))
    })?;
    for row in rows {
        let (id, name, extra) = row?;
        hits.push(SettingHitDto {
            kind: kind.to_string(),
            id,
            snippet: extra,
            name,
        });
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::work::{SaveChapterPayload, WorkPackage};
    use serde_json::json;
    use tempfile::tempdir;

    fn work() -> (tempfile::TempDir, WorkPackage) {
        let dir = tempdir().unwrap();
        let created = WorkPackage::create(dir.path(), "北境行纪").unwrap();
        (dir, created)
    }

    #[test]
    fn searches_two_char_name_alias_and_chapter_phrase() {
        let (_dir, work) = work();
        let character = work.create_character().unwrap();
        work.save_character(&crate::setting::CharacterDto {
            id: character.id.clone(),
            name: "阿宁".into(),
            aliases: vec!["宁儿".into()],
            summary: "守关人".into(),
            appearance: json!({"type":"doc","content":[{"type":"paragraph"}]}),
            personality: json!({"type":"doc","content":[{"type":"paragraph"}]}),
            background: json!({"type":"doc","content":[{"type":"paragraph"}]}),
        })
        .unwrap();
        let chapter = work.opened().unwrap().chapter.unwrap();
        work.save_chapter(&SaveChapterPayload {
            id: chapter.id.clone(),
            title: chapter.title,
            body: json!({
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
        let by_name = work.search_work("阿宁").unwrap();
        assert!(by_name.settings.iter().any(|item| item.id == character.id));
        let by_alias = work.search_work("宁儿").unwrap();
        assert!(by_alias.settings.iter().any(|item| item.id == character.id));
        let by_summary = work.search_work("守关人").unwrap();
        assert!(by_summary.settings.iter().any(|item| item.id == character.id));
        let by_phrase = work.search_work("他才出关").unwrap();
        assert!(by_phrase.chapters.iter().any(|item| item.id == chapter.id));
    }

    #[test]
    fn chapter_and_character_share_one_undirected_association() {
        let (_dir, work) = work();
        let chapter = work.opened().unwrap().chapter.unwrap();
        let character = work.create_character().unwrap();
        let first = work
            .create_association(&CreateAssociationPayload {
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
        let second = work
            .create_association(&CreateAssociationPayload {
                left: LinkRefDto {
                    kind: "character".into(),
                    id: character.id.clone(),
                },
                right: LinkRefDto {
                    kind: "chapter".into(),
                    id: chapter.id.clone(),
                },
                note: "同乡".into(),
            })
            .unwrap();
        assert_eq!(first.id, second.id);
        assert_eq!(work.list_associations("chapter", &chapter.id).unwrap().len(), 1);
        assert_eq!(
            work.list_associations("character", &character.id).unwrap()[0].id,
            first.id
        );
        assert!(work
            .create_association(&CreateAssociationPayload {
                left: LinkRefDto {
                    kind: "storyline".into(),
                    id: "x".into(),
                },
                right: LinkRefDto {
                    kind: "chapter".into(),
                    id: chapter.id,
                },
                note: String::new(),
            })
            .is_err());
    }
}
