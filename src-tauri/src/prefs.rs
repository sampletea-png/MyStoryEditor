use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Prefs {
    pub library_path: Option<String>,
}

impl Prefs {
    pub fn load(path: &Path) -> Self {
        fs::read_to_string(path)
            .ok()
            .and_then(|text| serde_json::from_str(&text).ok())
            .unwrap_or_default()
    }

    pub fn save(&self, path: &Path) -> AppResult<()> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::write(path, serde_json::to_string_pretty(self)?)?;
        Ok(())
    }
}

pub fn default_library_path() -> PathBuf {
    dirs::document_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("小说作品库")
}

pub fn folder_name_from_work_name(name: &str) -> String {
    let stripped: String = name
        .trim()
        .chars()
        .filter(|ch| !matches!(ch, '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' ) && !ch.is_control())
        .collect();
    let trimmed = stripped.trim_end_matches([' ', '.']).to_string();
    if trimmed.is_empty() {
        "未命名作品".to_string()
    } else {
        trimmed
    }
}

pub fn unique_folder_name(desired: &str, existing_lower: &[String]) -> String {
    let base = folder_name_from_work_name(desired);
    let exists = |name: &str| existing_lower.iter().any(|item| item == &name.to_lowercase());
    if !exists(&base) {
        return base;
    }
    let mut n = 2;
    loop {
        let candidate = format!("{base}-{n}");
        if !exists(&candidate) {
            return candidate;
        }
        n += 1;
    }
}

pub fn require_library_path(path: &Option<String>) -> AppResult<PathBuf> {
    path.as_deref()
        .map(PathBuf::from)
        .ok_or_else(|| AppError::Message("尚未指定作品库位置".into()))
}
