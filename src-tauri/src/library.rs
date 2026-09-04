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
    let recovery_problems = WorkPackage::recover_interrupted_replacements(&root)?;
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
    for (source, problem) in recovery_problems {
        let path = source.to_string_lossy().into_owned();
        if let Some(summary) = summaries.iter_mut().find(|summary| summary.path == path) {
            summary.problem = Some(match summary.problem.take() {
                Some(existing) => format!("{existing}\n{problem}"),
                None => problem,
            });
        } else {
            let folder_name = source.file_name().unwrap_or_default().to_string_lossy().into_owned();
            summaries.push(WorkSummary {
                id: format!("damaged:{path}"),
                name: folder_name.clone(),
                folder_name,
                path,
                recycled,
                problem: Some(problem),
            });
        }
    }
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

#[cfg(all(test, windows))]
mod tests {
    use super::*;

    struct DeniedDirectory(PathBuf);

    impl DeniedDirectory {
        fn set_access(path: &Path, deny: bool) {
            let action = if deny { "AddAccessRule" } else { "RemoveAccessRuleSpecific" };
            let script = format!(
                "$ErrorActionPreference = 'Stop'; \
                 $acl = [System.IO.Directory]::GetAccessControl($env:STORY_TEST_DENIED_DIR); \
                 $sid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User; \
                 $rule = [System.Security.AccessControl.FileSystemAccessRule]::new($sid, 'ListDirectory', 'Deny'); \
                 $acl.{action}($rule); \
                 [System.IO.Directory]::SetAccessControl($env:STORY_TEST_DENIED_DIR, $acl)"
            );
            let output = std::process::Command::new("powershell.exe")
                .args(["-NoProfile", "-NonInteractive", "-Command", &script])
                .env("STORY_TEST_DENIED_DIR", path)
                .output().unwrap();
            assert!(output.status.success(), "ACL setup/cleanup failed: {}",
                String::from_utf8_lossy(&output.stderr));
        }

        fn new(path: &Path) -> Self {
            Self::set_access(path, true);
            let guard = Self(path.to_path_buf());
            assert_eq!(fs::read_dir(path).unwrap_err().kind(), std::io::ErrorKind::PermissionDenied,
                "the regression must exercise actual Windows denied access");
            guard
        }
    }

    impl Drop for DeniedDirectory {
        fn drop(&mut self) {
            Self::set_access(&self.0, false);
        }
    }

    #[test]
    fn list_works_isolates_denied_recovery_directory_and_reports_its_path() {
        let dir = tempfile::tempdir().unwrap();
        let healthy = WorkPackage::create(dir.path(), "健康作品").unwrap();
        let healthy_id = healthy.summary(false).id;
        drop(healthy);
        let source = dir.path().join("待恢复作品");
        let recovery = restore_points_dir(&source);
        fs::create_dir(&recovery).unwrap();
        let denied = DeniedDirectory::new(&recovery);

        let listed = list_works(dir.path(), false).expect("one unreadable recovery directory must not hide healthy works");
        assert!(listed.iter().any(|work| work.id == healthy_id && work.problem.is_none()));
        let affected = listed.iter().find(|work| work.path == source.to_string_lossy()).unwrap();
        assert!(affected.problem.as_ref().unwrap().contains(recovery.to_str().unwrap()));
        assert!(!source.exists(), "failed recovery must not recreate the source");

        drop(denied);
        let listed = list_works(dir.path(), false).unwrap();
        assert_eq!(listed.len(), 1, "transient diagnostics should clear on the next discovery");
        assert_eq!(listed[0].id, healthy_id);
    }

    #[test]
    fn list_works_isolates_failed_recovery_stage_and_retries_without_losing_works() {
        use std::os::windows::fs::OpenOptionsExt;

        let dir = tempfile::tempdir().unwrap();
        let healthy = WorkPackage::create(dir.path(), "健康作品").unwrap();
        let healthy_id = healthy.summary(false).id;
        drop(healthy);
        let mut staged = Vec::new();
        for name in ["被占用的恢复原稿", "可恢复原稿"] {
            let work = WorkPackage::create(dir.path(), name).unwrap();
            let summary = work.summary(false);
            drop(work);
            let source = PathBuf::from(&summary.path);
            let stage = restore_points_dir(&source).join(format!(".replacement-{}", Uuid::new_v4()));
            fs::create_dir(&stage).unwrap();
            fs::rename(&source, stage.join("previous")).unwrap();
            staged.push((summary, stage));
        }
        // A real Windows handle permits validation reads but denies moving the original.
        let held = fs::OpenOptions::new().read(true).share_mode(3)
            .custom_flags(0x02000000) // FILE_FLAG_BACKUP_SEMANTICS: open a directory.
            .open(staged[0].1.join("previous")).unwrap();
        assert_eq!(fs::rename(staged[0].1.join("previous"), &staged[0].0.path)
            .unwrap_err().raw_os_error(), Some(32), "Windows must actually deny the rename");

        let listed = list_works(dir.path(), false).unwrap();
        assert_eq!(listed.len(), 3);
        assert!(listed.iter().any(|work| work.id == healthy_id && work.problem.is_none()));
        assert!(listed.iter().any(|work| work.id == staged[1].0.id && work.problem.is_none()),
            "an unrelated interrupted replacement must still recover");
        let affected = listed.iter().find(|work| work.path == staged[0].0.path).unwrap();
        assert!(affected.problem.as_ref().unwrap().contains(staged[0].1.to_str().unwrap()));
        assert!(!Path::new(&staged[0].0.path).exists());

        drop(held);
        let listed = list_works(dir.path(), false).unwrap();
        assert_eq!(listed.len(), 3);
        assert!(listed.iter().all(|work| work.problem.is_none()));
        for (original, _) in staged {
            let found = listed.iter().find(|work| work.id == original.id).unwrap();
            assert_eq!(found.path, original.path);
            let reopened = WorkPackage::open(Path::new(&found.path)).unwrap();
            assert_eq!(reopened.opened().unwrap().chapter.unwrap().title, "第一章");
        }
    }
}
