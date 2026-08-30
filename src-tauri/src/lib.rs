mod backup;
mod error;
mod library;
mod link;
mod prefs;
mod schema;
mod setting;
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
use link::{
    AssociationDto, CreateAssociationPayload, SearchResultsDto,
};
use setting::{
    CharacterDto, EventDto, LocationDto, RecycleItemDto, RestoreResultDto, SettingCatalogDto,
    SettingCategoryDto, SettingEntryDto, StorylineDto,
};
use backup::{RestoreKind, RestorePoint};
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
    let mut open = state.open.lock().expect("open work lock");
    if let Some(work) = open.as_ref() {
        work.create_restore_point(RestoreKind::Auto).map_err(String::from)?;
    }
    *open = None;
    Ok(())
}

#[tauri::command]
fn create_restore_point(state: State<AppState>) -> Result<RestorePoint, String> {
    with_open(&state, |work| work.create_restore_point(RestoreKind::Manual)).map_err(String::from)
}

#[tauri::command]
fn list_restore_points(state: State<AppState>) -> Result<Vec<RestorePoint>, String> {
    with_open(&state, |work| work.list_restore_points()).map_err(String::from)
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

#[tauri::command]
fn load_catalog(state: State<AppState>) -> Result<SettingCatalogDto, String> {
    with_open(&state, |work| work.catalog()).map_err(String::from)
}

#[tauri::command]
fn create_character(state: State<AppState>) -> Result<CharacterDto, String> {
    with_open(&state, |work| work.create_character()).map_err(String::from)
}

#[tauri::command]
fn save_character(state: State<AppState>, payload: CharacterDto) -> Result<(), String> {
    with_open(&state, |work| work.save_character(&payload)).map_err(String::from)
}

#[tauri::command]
fn delete_character(state: State<AppState>, id: String) -> Result<(), String> {
    with_open(&state, |work| work.delete_character(&id)).map_err(String::from)
}

#[tauri::command]
fn create_location(state: State<AppState>, parent_id: Option<String>) -> Result<LocationDto, String> {
    with_open(&state, |work| work.create_location(parent_id)).map_err(String::from)
}

#[tauri::command]
fn save_location(state: State<AppState>, payload: LocationDto) -> Result<SettingCatalogDto, String> {
    with_open(&state, |work| work.save_location(&payload)).map_err(String::from)
}

#[tauri::command]
fn delete_location(state: State<AppState>, id: String) -> Result<SettingCatalogDto, String> {
    with_open(&state, |work| work.delete_location(&id)).map_err(String::from)
}

#[tauri::command]
fn create_event(state: State<AppState>) -> Result<EventDto, String> {
    with_open(&state, |work| work.create_event()).map_err(String::from)
}

#[tauri::command]
fn save_event(state: State<AppState>, payload: EventDto) -> Result<(), String> {
    with_open(&state, |work| work.save_event(&payload)).map_err(String::from)
}

#[tauri::command]
fn delete_event(state: State<AppState>, id: String) -> Result<(), String> {
    with_open(&state, |work| work.delete_event(&id)).map_err(String::from)
}

#[tauri::command]
fn create_storyline(state: State<AppState>) -> Result<StorylineDto, String> {
    with_open(&state, |work| work.create_storyline()).map_err(String::from)
}

#[tauri::command]
fn save_storyline(state: State<AppState>, id: String, name: String, summary: String) -> Result<(), String> {
    with_open(&state, |work| work.save_storyline(&id, &name, &summary)).map_err(String::from)
}

#[tauri::command]
fn delete_storyline(state: State<AppState>, id: String) -> Result<(), String> {
    with_open(&state, |work| work.delete_storyline(&id)).map_err(String::from)
}

#[tauri::command]
fn add_event_to_storyline(
    state: State<AppState>,
    storyline_id: String,
    event_id: String,
) -> Result<StorylineDto, String> {
    with_open(&state, |work| work.add_event_to_storyline(&storyline_id, &event_id)).map_err(String::from)
}

#[tauri::command]
fn remove_event_from_storyline(
    state: State<AppState>,
    storyline_id: String,
    event_id: String,
) -> Result<StorylineDto, String> {
    with_open(&state, |work| work.remove_event_from_storyline(&storyline_id, &event_id))
        .map_err(String::from)
}

#[tauri::command]
fn move_storyline_event(
    state: State<AppState>,
    storyline_id: String,
    event_id: String,
    direction: String,
) -> Result<StorylineDto, String> {
    with_open(&state, |work| work.move_storyline_event(&storyline_id, &event_id, &direction))
        .map_err(String::from)
}

#[tauri::command]
fn create_setting_entry(
    state: State<AppState>,
    category_id: Option<String>,
) -> Result<SettingEntryDto, String> {
    with_open(&state, |work| work.create_setting_entry(category_id)).map_err(String::from)
}

#[tauri::command]
fn save_setting_entry(state: State<AppState>, payload: SettingEntryDto) -> Result<(), String> {
    with_open(&state, |work| work.save_setting_entry(&payload)).map_err(String::from)
}

#[tauri::command]
fn delete_setting_entry(state: State<AppState>, id: String) -> Result<(), String> {
    with_open(&state, |work| work.delete_setting_entry(&id)).map_err(String::from)
}

#[tauri::command]
fn create_category(state: State<AppState>, name: String) -> Result<SettingCategoryDto, String> {
    with_open(&state, |work| work.create_category(&name)).map_err(String::from)
}

#[tauri::command]
fn rename_category(state: State<AppState>, id: String, name: String) -> Result<(), String> {
    with_open(&state, |work| work.rename_category(&id, &name)).map_err(String::from)
}

#[tauri::command]
fn delete_category(state: State<AppState>, id: String) -> Result<SettingCatalogDto, String> {
    with_open(&state, |work| work.delete_category(&id)).map_err(String::from)
}

#[tauri::command]
fn list_work_recycle(state: State<AppState>) -> Result<Vec<RecycleItemDto>, String> {
    with_open(&state, |work| work.list_recycle()).map_err(String::from)
}

#[tauri::command]
fn restore_recycle_item(
    state: State<AppState>,
    kind: String,
    id: String,
) -> Result<RestoreResultDto, String> {
    with_open(&state, |work| work.restore_recycle(&kind, &id)).map_err(String::from)
}

#[tauri::command]
fn permanently_delete_recycle_item(
    state: State<AppState>,
    kind: String,
    id: String,
) -> Result<(), String> {
    with_open(&state, |work| work.permanently_delete_recycle(&kind, &id)).map_err(String::from)
}

#[tauri::command]
fn search_work(state: State<AppState>, query: String) -> Result<SearchResultsDto, String> {
    with_open(&state, |work| work.search_work(&query)).map_err(String::from)
}

#[tauri::command]
fn list_associations(
    state: State<AppState>,
    kind: String,
    id: String,
) -> Result<Vec<AssociationDto>, String> {
    with_open(&state, |work| work.list_associations(&kind, &id)).map_err(String::from)
}

#[tauri::command]
fn create_association(
    state: State<AppState>,
    payload: CreateAssociationPayload,
) -> Result<AssociationDto, String> {
    with_open(&state, |work| work.create_association(&payload)).map_err(String::from)
}

#[tauri::command]
fn update_association_note(state: State<AppState>, id: String, note: String) -> Result<(), String> {
    with_open(&state, |work| work.update_association_note(&id, &note)).map_err(String::from)
}

#[tauri::command]
fn delete_association(state: State<AppState>, id: String) -> Result<(), String> {
    with_open(&state, |work| work.delete_association(&id)).map_err(String::from)
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
            fail_next_save,
            load_catalog,
            create_character,
            save_character,
            delete_character,
            create_location,
            save_location,
            delete_location,
            create_event,
            save_event,
            delete_event,
            create_storyline,
            save_storyline,
            delete_storyline,
            add_event_to_storyline,
            remove_event_from_storyline,
            move_storyline_event,
            create_setting_entry,
            save_setting_entry,
            delete_setting_entry,
            create_category,
            rename_category,
            delete_category,
            list_work_recycle,
            restore_recycle_item,
            permanently_delete_recycle_item,
            search_work,
            list_associations,
            create_association,
            update_association_note,
            delete_association,
            create_restore_point,
            list_restore_points
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
