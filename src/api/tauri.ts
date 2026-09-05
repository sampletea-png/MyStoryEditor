import { invoke } from "@tauri-apps/api/core";
import { confirm, open, save } from "@tauri-apps/plugin-dialog";
import type { ChapterStatus, Outline } from "../domain/outline";
import type { RecycleKind } from "../domain/setting";
import type { ChapterDocument } from "../domain/exportBody";
import { runBodyExport, type ExportFileHost } from "./exportFiles";
import type { AppApi, ChapterBody, OpenedWork, WorkSummary } from "./types";

type BodyExportSource = {
  workName: string;
  outline: Outline;
  chapters: ChapterDocument[];
};

function tauriExportFiles(): ExportFileHost {
  return {
    async pickSavePath(suggestedName) {
      const extension = suggestedName.includes(".")
        ? suggestedName.slice(suggestedName.lastIndexOf(".") + 1)
        : "txt";
      const selected = await save({
        defaultPath: suggestedName,
        title: "导出正文",
        filters: [{ name: exportFilterName(extension), extensions: [extension] }],
      });
      return typeof selected === "string" ? selected : null;
    },
    exists: (path) => invoke("export_path_exists", { path }),
    confirmOverwrite: (path) =>
      confirm(`「${path}」已存在，要覆盖吗？`, {
        title: "导出正文",
        kind: "warning",
        okLabel: "覆盖",
        cancelLabel: "取消",
      }),
    writeBytes: (path, bytes) => invoke("write_export_file", { path, bytes: Array.from(bytes) }),
  };
}

function exportFilterName(extension: string): string {
  if (extension === "md") {
    return "Markdown";
  }
  if (extension === "docx") {
    return "DOCX";
  }
  return "纯文本";
}

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function createTauriApi(): AppApi {
  return {
    getBootstrap: () => invoke("get_bootstrap"),
    setLibraryPath: (path) => invoke("set_library_path", { path }),
    async pickDirectory(defaultPath) {
      const selected = await open({
        directory: true,
        multiple: false,
        defaultPath,
        title: "选择作品库位置",
      });
      return typeof selected === "string" ? selected : null;
    },
    listWorks: () => invoke("list_works"),
    listRecycledWorks: () => invoke("list_recycled_works"),
    createWork: (name) => invoke("create_work", { name }),
    exportWorkArchive: async (id) => {
      const bytes = await invoke<number[]>("export_work_archive", { id });
      return new Uint8Array(bytes);
    },
    importWorkArchive: (archive) => invoke("import_work_archive", { archive: Array.from(archive) }),
    renameWork: (id, name) => invoke("rename_work", { id, name }),
    deleteWork: (id) => invoke("delete_work", { id }),
    restoreWork: (id) => invoke("restore_work", { id }),
    permanentlyDeleteWork: (id) => invoke("permanently_delete_work", { id }),
    openWork: (id) => invoke("open_work", { id }),
    closeWork: () => invoke("close_work"),
    createVolume: (title) => invoke("create_volume", { title }),
    cancelVolumes: () => invoke("cancel_volumes"),
    createChapter: (options) => invoke("create_chapter", { options }),
    renameVolume: (id, title) => invoke("rename_volume", { id, title }),
    renameChapter: (id, title) => invoke("rename_chapter", { id, title }),
    deleteVolume: (id) => invoke("delete_volume", { id }),
    deleteChapter: (id) => invoke("delete_chapter", { id }),
    moveChapter: (id, direction) => invoke("move_chapter", { id, direction }),
    setChapterStatus: (id, status: ChapterStatus) =>
      invoke("set_chapter_status", { id, status }),
    saveChapter: (payload) => invoke("save_chapter", { payload }),
    loadChapter: (id) => invoke("load_chapter", { id }),
    failNextSave: () => invoke("fail_next_save"),
    loadCatalog: () => invoke("load_catalog"),
    createCharacter: () => invoke("create_character"),
    saveCharacter: (payload) => invoke("save_character", { payload }),
    deleteCharacter: (id) => invoke("delete_character", { id }),
    createLocation: (parentId) => invoke("create_location", { parentId }),
    saveLocation: (payload) => invoke("save_location", { payload }),
    deleteLocation: (id) => invoke("delete_location", { id }),
    createEvent: () => invoke("create_event"),
    saveEvent: (payload) => invoke("save_event", { payload }),
    deleteEvent: (id) => invoke("delete_event", { id }),
    createStoryline: () => invoke("create_storyline"),
    saveStoryline: (payload) =>
      invoke("save_storyline", { id: payload.id, name: payload.name, summary: payload.summary }),
    deleteStoryline: (id) => invoke("delete_storyline", { id }),
    addEventToStoryline: (storylineId, eventId) =>
      invoke("add_event_to_storyline", { storylineId, eventId }),
    removeEventFromStoryline: (storylineId, eventId) =>
      invoke("remove_event_from_storyline", { storylineId, eventId }),
    moveStorylineEvent: (storylineId, eventId, direction) =>
      invoke("move_storyline_event", { storylineId, eventId, direction }),
    createSettingEntry: (categoryId) => invoke("create_setting_entry", { categoryId }),
    saveSettingEntry: (payload) => invoke("save_setting_entry", { payload }),
    deleteSettingEntry: (id) => invoke("delete_setting_entry", { id }),
    createCategory: (name) => invoke("create_category", { name }),
    renameCategory: (id, name) => invoke("rename_category", { id, name }),
    deleteCategory: (id) => invoke("delete_category", { id }),
    listWorkRecycle: () => invoke("list_work_recycle"),
    restoreRecycleItem: (kind: RecycleKind, id) => invoke("restore_recycle_item", { kind, id }),
    permanentlyDeleteRecycleItem: (kind: RecycleKind, id) =>
      invoke("permanently_delete_recycle_item", { kind, id }),
    searchWork: (query) => invoke("search_work", { query }),
    listAssociations: (kind, id) => invoke("list_associations", { kind, id }),
    createAssociation: (payload) => invoke("create_association", { payload }),
    updateAssociationNote: (id, note) => invoke("update_association_note", { id, note }),
    deleteAssociation: (id) => invoke("delete_association", { id }),
    getWorkMap: () => invoke("get_work_map"),
    putWorkMap: (payload) => invoke("put_work_map", { payload }),
    clearWorkMap: () => invoke("clear_work_map"),
    createRestorePoint: () => invoke("create_restore_point"),
    listRestorePoints: (workId) => invoke("list_restore_points", { workId }),
    restoreFromPoint: (workId, folderName, replaceConfirmed = false, pendingDraft) =>
      invoke("restore_from_point", { workId, folderName, replaceConfirmed, pendingDraft }),
    async exportBody(request) {
      const source = await invoke<BodyExportSource>("body_export_source");
      return runBodyExport(
        {
          workName: source.workName,
          outline: source.outline,
          chapters: source.chapters,
          request,
        },
        tauriExportFiles(),
      );
    },
  };
}

export type { ChapterBody, OpenedWork, WorkSummary };
