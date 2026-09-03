use std::fs;
use std::path::{Path, PathBuf};

use uuid::Uuid;

use crate::error::{AppError, AppResult};
use crate::work::{
    is_work_package, package_lock_path, read_manifest, restore_points_dir, write_manifest,
    WorkManifest, WorkPackage, WorkSummary, CORRUPT_PACKAGE, RECYCLE_DIR, RESTORE_SUFFIX,
};

pub fn list_works(library: &Path, recycled: bool) -> AppResult<Vec<WorkSummary>> {
    let root = if recycled {
        library.join(RECYCLE_DIR)
    } else {
        library.to_path_buf()
    };
    if !root.is_dir() {
        return Ok(Vec::new());
    }
    let mut packages = Vec::new();
    let mut damaged = Vec::new();
    for entry in fs::read_dir(&root)? {
        let entry = entry?;
        let path = entry.path();
        if !path.is_dir() || skip_dir(&path) {
            continue;
        }
        if !is_work_package(&path) {
            continue;
        }
        let Ok(manifest) = read_manifest(&path) else {
            let folder_name = path
                .file_name()
                .map(|name| name.to_string_lossy().into_owned())
                .unwrap_or_default();
            damaged.push(WorkSummary {
                id: format!("damaged:{}", path.to_string_lossy()),
                name: "损坏的作品数据包".into(),
                folder_name,
                path: path.to_string_lossy().into_owned(),
                recycled,
                problem: Some(CORRUPT_PACKAGE.into()),
            });
            continue;
        };
        packages.push((path, manifest));
    }
    packages.sort_by(|a, b| a.0.cmp(&b.0));
    if !recycled {
        assign_unique_identities(&mut packages)?;
    }
    let mut summaries: Vec<_> = packages
        .into_iter()
        .map(|(path, manifest)| WorkSummary {
            id: manifest.id,
            name: manifest.name,
            folder_name: path
                .file_name()
                .map(|name| name.to_string_lossy().into_owned())
                .unwrap_or_default(),
            path: path.to_string_lossy().into_owned(),
            recycled,
            problem: None,
        })
        .collect();
    summaries.extend(damaged);
    summaries.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(summaries)
}

fn assign_unique_identities(packages: &mut [(PathBuf, WorkManifest)]) -> AppResult<()> {
    let mut seen = std::collections::HashSet::new();
    for (path, manifest) in packages.iter_mut() {
        if seen.insert(manifest.id.clone()) {
            continue;
        }
        manifest.id = Uuid::new_v4().to_string();
        write_manifest(path, manifest)?;
    }
    Ok(())
}

fn skip_dir(path: &Path) -> bool {
    path.file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| name == RECYCLE_DIR || name.ends_with(RESTORE_SUFFIX))
}

pub fn find_work_dir(library: &Path, id: &str, recycled: bool) -> AppResult<PathBuf> {
    let works = list_works(library, recycled)?;
    works
        .into_iter()
        .find(|item| item.id == id)
        .map(|item| PathBuf::from(item.path))
        .ok_or_else(|| AppError::Message("找不到这部作品".into()))
}

pub fn delete_to_recycle(library: &Path, id: &str) -> AppResult<()> {
    let source = find_work_dir(library, id, false)?;
    let recycle = library.join(RECYCLE_DIR);
    fs::create_dir_all(&recycle)?;
    let dest = unique_dest(&recycle, source.file_name().unwrap());
    move_dir(&source, &dest)?;
    let restore = restore_points_dir(&source);
    if restore.exists() {
        let restore_dest = unique_dest(&recycle, restore.file_name().unwrap());
        move_dir(&restore, &restore_dest)?;
    }
    let lock = package_lock_path(&source);
    if lock.is_file() {
        let _ = fs::remove_file(lock);
    }
    Ok(())
}

pub fn restore_work(library: &Path, id: &str) -> AppResult<()> {
    let source = find_work_dir(library, id, true)?;
    let dest = unique_dest(library, source.file_name().unwrap());
    move_dir(&source, &dest)?;
    Ok(())
}

pub fn permanently_delete(library: &Path, id: &str) -> AppResult<()> {
    let source = find_work_dir(library, id, true)?;
    fs::remove_dir_all(&source)?;
    let lock = package_lock_path(&source);
    if lock.is_file() {
        let _ = fs::remove_file(lock);
    }
    let restore = restore_points_dir(&source);
    if restore.exists() {
        fs::remove_dir_all(restore)?;
    }
    Ok(())
}

fn unique_dest(parent: &Path, name: &std::ffi::OsStr) -> PathBuf {
    let mut dest = parent.join(name);
    if !dest.exists() {
        return dest;
    }
    let stem = name.to_string_lossy();
    let mut n = 2;
    loop {
        dest = parent.join(format!("{stem}-{n}"));
        if !dest.exists() {
            return dest;
        }
        n += 1;
    }
}

fn move_dir(source: &Path, dest: &Path) -> AppResult<()> {
    if fs::rename(source, dest).is_ok() {
        return Ok(());
    }
    copy_dir(source, dest)?;
    fs::remove_dir_all(source)?;
    Ok(())
}

fn copy_dir(source: &Path, dest: &Path) -> AppResult<()> {
    fs::create_dir_all(dest)?;
    for entry in fs::read_dir(source)? {
        let entry = entry?;
        let to = dest.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_dir(&entry.path(), &to)?;
        } else {
            fs::copy(entry.path(), to)?;
        }
    }
    Ok(())
}

pub fn create_work_package(library: &Path, name: &str) -> AppResult<WorkPackage> {
    WorkPackage::create(library, name)
}
