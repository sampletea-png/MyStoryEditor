import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type { ChapterStatus } from "../domain/outline";
import type { AppApi, ChapterBody, OpenedWork, WorkSummary } from "./types";

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
  };
}

export type { ChapterBody, OpenedWork, WorkSummary };
