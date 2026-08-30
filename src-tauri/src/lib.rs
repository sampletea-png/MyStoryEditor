mod backup;
mod error;
mod library;
mod prefs;
mod schema;
mod work;

use std::fs;
use std::sync::Mutex;

use error::{AppError, AppResult};
use library::{
    create_work_package, delete_to_recycle, find_work_dir, list_works as scan_works, permanently_delete,
};
use prefs::{default_library_path, require_library_path, Prefs};
use serde::Serialize;
use tauri::{Manager, State};
use work::{
    CreateChapterOptions, OpenedWorkDto, OutlineDto, SaveChapterPayload, WorkPackage, WorkSummary,
};

pub struct AppState {
    prefs_path: std::path::PathBuf,
    prefs: Mutex<Prefs>,
    open: Mutex<Option<WorkPackage>>,
    fail_next_save: Mutex<bool>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Bootstrap {
    library_path: Option<String>,
    default_library_path: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SaveResult {
    word_count: i64,
    work_word_count: i64,
}

fn with_open<T>(state: &AppState, f: impl FnOnce(&mut WorkPackage) -> AppResult<T>) -> AppResult<T> {
    let mut guard = state.open.lock().expect("open work lock");
    let work = guard
        .as_mut()
        .ok_or_else(|| AppError::Message("没有打开的作品".into()))?;
    f(work)
}

fn library_path(state: &AppState) -> AppResult<std::path::PathBuf> {
    let prefs = state.prefs.lock().expect("prefs lock");
    require_library_path(&prefs.library_path)
}

#[tauri::command]
fn get_bootstrap(state: State<AppState>) -> Bootstrap {
    let prefs = state.prefs.lock().expect("prefs lock");
    Bootstrap {
        library_path: prefs.library_path.clone(),
        default_library_path: default_library_path().to_string_lossy().into_owned(),
    }
}

#[tauri::command]
fn set_library_path(state: State<AppState>, path: String) -> Result<(), String> {
    fs::create_dir_all(&path).map_err(|err| err.to_string())?;
    let mut prefs = state.prefs.lock().expect("prefs lock");
    prefs.library_path = Some(path);
    prefs.save(&state.prefs_path).map_err(String::from)
}

#[tauri::command]
fn list_works(state: State<AppState>) -> Result<Vec<WorkSummary>, String> {
    scan_works(&library_path(&state)?, false).map_err(String::from)
}

#[tauri::command]
fn list_recycled_works(state: State<AppState>) -> Result<Vec<WorkSummary>, String> {
    scan_works(&library_path(&state)?, true).map_err(String::from)
}

#[tauri::command]
fn create_work(state: State<AppState>, name: String) -> Result<OpenedWorkDto, String> {
    let library = library_path(&state)?;
    let package = create_work_package(&library, &name).map_err(String::from)?;
    let opened = package.opened().map_err(String::from)?;
    *state.open.lock().expect("open work lock") = Some(package);
    Ok(opened)
}

#[tauri::command]
fn rename_work(state: State<AppState>, id: String, name: String) -> Result<(), String> {
    if let Some(open) = state.open.lock().expect("open work lock").as_mut() {
        if open.manifest.id == id {
            return open.rename_work(&name).map_err(String::from);
        }
    }
    let library = library_path(&state)?;
    let path = find_work_dir(&library, &id, false).map_err(String::from)?;
    let mut manifest = work::read_manifest(&path).map_err(String::from)?;
    manifest.name = name;
    work::write_manifest(&path, &manifest).map_err(String::from)
}

#[tauri::command]
fn delete_work(state: State<AppState>, id: String) -> Result<(), String> {
    {
        let mut open = state.open.lock().expect("open work lock");
        if open.as_ref().is_some_and(|work| work.manifest.id == id) {
            *open = None;
        }
    }
    delete_to_recycle(&library_path(&state)?, &id).map_err(String::from)
}

#[tauri::command]
fn restore_work(state: State<AppState>, id: String) -> Result<(), String> {
    library::restore_work(&library_path(&state)?, &id).map_err(String::from)
}

#[tauri::command]
fn permanently_delete_work(state: State<AppState>, id: String) -> Result<(), String> {
    permanently_delete(&library_path(&state)?, &id).map_err(String::from)
}

#[tauri::command]
fn open_work(state: State<AppState>, id: String) -> Result<OpenedWorkDto, String> {
    let library = library_path(&state)?;
    let path = find_work_dir(&library, &id, false).map_err(String::from)?;
    let package = WorkPackage::open(&path).map_err(String::from)?;
    let opened = package.opened().map_err(String::from)?;
    *state.open.lock().expect("open work lock") = Some(package);
    Ok(opened)
}

#[tauri::command]
fn close_work(state: State<AppState>) -> Result<(), String> {
    *state.open.lock().expect("open work lock") = None;
    Ok(())
}

#[tauri::command]
fn create_volume(state: State<AppState>, title: String) -> Result<OutlineDto, String> {
    with_open(&state, |work| work.create_volume(&title)).map_err(String::from)
}

#[tauri::command]
fn cancel_volumes(state: State<AppState>) -> Result<OutlineDto, String> {
    with_open(&state, |work| work.cancel_volumes()).map_err(String::from)
}

#[tauri::command]
fn create_chapter(
    state: State<AppState>,
    options: CreateChapterOptions,
) -> Result<serde_json::Value, String> {
    let (outline, chapter) = with_open(&state, |work| work.create_chapter(&options)).map_err(String::from)?;
    serde_json::to_value(serde_json::json!({ "outline": outline, "chapter": chapter }))
        .map_err(|err| err.to_string())
}

#[tauri::command]
fn rename_volume(state: State<AppState>, id: String, title: String) -> Result<OutlineDto, String> {
    with_open(&state, |work| work.rename_volume(&id, &title)).map_err(String::from)
}

#[tauri::command]
fn rename_chapter(state: State<AppState>, id: String, title: String) -> Result<OutlineDto, String> {
    with_open(&state, |work| work.rename_chapter(&id, &title)).map_err(String::from)
}

#[tauri::command]
fn delete_volume(state: State<AppState>, id: String) -> Result<OutlineDto, String> {
    with_open(&state, |work| work.delete_volume(&id)).map_err(String::from)
}

#[tauri::command]
fn delete_chapter(state: State<AppState>, id: String) -> Result<OutlineDto, String> {
    with_open(&state, |work| work.delete_chapter(&id)).map_err(String::from)
}

#[tauri::command]
fn move_chapter(state: State<AppState>, id: String, direction: String) -> Result<OutlineDto, String> {
    with_open(&state, |work| work.move_chapter(&id, &direction)).map_err(String::from)
}

#[tauri::command]
fn set_chapter_status(state: State<AppState>, id: String, status: String) -> Result<(), String> {
    with_open(&state, |work| work.set_chapter_status(&id, &status)).map_err(String::from)
}

#[tauri::command]
fn save_chapter(state: State<AppState>, payload: SaveChapterPayload) -> Result<SaveResult, String> {
    if *state.fail_next_save.lock().expect("fail flag") {
        *state.fail_next_save.lock().expect("fail flag") = false;
        return Err("保存失败（模拟）".into());
    }
    let (word_count, work_word_count) =
        with_open(&state, |work| work.save_chapter(&payload)).map_err(String::from)?;
    Ok(SaveResult {
        word_count,
        work_word_count,
    })
}

#[tauri::command]
fn load_chapter(state: State<AppState>, id: String) -> Result<work::ChapterBodyDto, String> {
    with_open(&state, |work| work.load_chapter(&id)).map_err(String::from)
}

#[tauri::command]
fn fail_next_save(state: State<AppState>) -> Result<(), String> {
    *state.fail_next_save.lock().expect("fail flag") = true;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            fs::create_dir_all(&dir)?;
            let prefs_path = dir.join("preferences.json");
            let prefs = Prefs::load(&prefs_path);
            app.manage(AppState {
                prefs_path,
                prefs: Mutex::new(prefs),
                open: Mutex::new(None),
                fail_next_save: Mutex::new(false),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_bootstrap,
            set_library_path,
            list_works,
            list_recycled_works,
            create_work,
            rename_work,
            delete_work,
            restore_work,
            permanently_delete_work,
            open_work,
            close_work,
            create_volume,
            cancel_volumes,
            create_chapter,
            rename_volume,
            rename_chapter,
            delete_volume,
            delete_chapter,
            move_chapter,
            set_chapter_status,
            save_chapter,
            load_chapter,
            fail_next_save
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
