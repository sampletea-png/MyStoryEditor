import { assignUniqueIdentities } from "../domain/workIdentity";
import {
  cancelVolumes,
  createFirstVolume,
  insertChapter,
  removeChapter,
  renameChapter,
  type Chapter,
  type ChapterStatus,
  type Outline,
  type Volume,
} from "../domain/outline";
import { uniqueFolderName } from "../domain/folderName";
import { countDocumentWords, type TipTapNode } from "../domain/wordCount";
import type {
  AppApi,
  ChapterBody,
  OpenedWork,
  Session,
  WorkSummary,
} from "./types";

const EMPTY_DOC: TipTapNode = {
  type: "doc",
  content: [{ type: "paragraph" }],
};

type StoredChapter = Chapter & {
  body: TipTapNode;
  documentSchemaVersion: number;
  wordCount: number;
  cursorFrom: number;
  cursorTo: number;
  scrollTop: number;
};

type StoredWork = {
  summary: WorkSummary;
  outline: Outline;
  chapters: Map<string, StoredChapter>;
  session: Session;
};

function createId() {
  return crypto.randomUUID();
}

function emptyChapter(title: string, volumeId: string | null, sortOrder: number): StoredChapter {
  return {
    id: createId(),
    title,
    status: "初稿",
    volumeId,
    sortOrder,
    body: structuredClone(EMPTY_DOC),
    documentSchemaVersion: 1,
    wordCount: 0,
    cursorFrom: 1,
    cursorTo: 1,
    scrollTop: 0,
  };
}

function toBody(chapter: StoredChapter): ChapterBody {
  return {
    id: chapter.id,
    title: chapter.title,
    status: chapter.status,
    body: structuredClone(chapter.body),
    documentSchemaVersion: chapter.documentSchemaVersion,
    wordCount: chapter.wordCount,
    cursorFrom: chapter.cursorFrom,
    cursorTo: chapter.cursorTo,
    scrollTop: chapter.scrollTop,
  };
}

function workWordCount(work: StoredWork): number {
  return [...work.chapters.values()].reduce((sum, chapter) => sum + chapter.wordCount, 0);
}

function opened(work: StoredWork): OpenedWork {
  const chapter = work.session.chapterId
    ? work.chapters.get(work.session.chapterId)
    : [...work.chapters.values()][0];
  return {
    work: { ...work.summary },
    outline: structuredClone(work.outline),
    session: { ...work.session },
    chapter: chapter ? toBody(chapter) : null,
    workWordCount: workWordCount(work),
    fts5: true,
  };
}

export function createMemoryApi(): AppApi {
  let libraryPath: string | null = null;
  const defaultLibraryPath = "文档/小说作品库";
  const works = new Map<string, StoredWork>();
  const recycled = new Map<string, StoredWork>();
  let openId: string | null = null;
  let failNext = false;

  const requireOpen = () => {
    if (!openId) {
      throw new Error("没有打开的作品");
    }
    const work = works.get(openId);
    if (!work) {
      throw new Error("没有打开的作品");
    }
    return work;
  };

  const syncOutline = (work: StoredWork, outline: Outline) => {
    work.outline = outline;
    for (const chapter of outline.chapters) {
      const stored = work.chapters.get(chapter.id);
      if (stored) {
        stored.title = chapter.title;
        stored.status = chapter.status;
        stored.sortOrder = chapter.sortOrder;
        stored.volumeId = chapter.volumeId;
      }
    }
    for (const id of [...work.chapters.keys()]) {
      if (!outline.chapters.some((chapter) => chapter.id === id)) {
        work.chapters.delete(id);
      }
    }
  };

  return {
    async getBootstrap() {
      return { libraryPath, defaultLibraryPath };
    },
    async setLibraryPath(path) {
      libraryPath = path;
    },
    async pickDirectory() {
      return defaultLibraryPath;
    },
    async listWorks() {
      const discovered = [...works.values()].map((work) => ({
        path: work.summary.path,
        manifest: {
          id: work.summary.id,
          name: work.summary.name,
          createdAt: "",
          updatedAt: "",
        },
      }));
      const unique = assignUniqueIdentities(discovered, createId);
      for (const item of unique.packages) {
        const work = [...works.values()].find((entry) => entry.summary.path === item.path);
        if (work && work.summary.id !== item.manifest.id) {
          works.delete(work.summary.id);
          work.summary.id = item.manifest.id;
          works.set(work.summary.id, work);
        }
      }
      return [...works.values()].map((work) => ({ ...work.summary }));
    },
    async listRecycledWorks() {
      return [...recycled.values()].map((work) => ({ ...work.summary, recycled: true }));
    },
    async createWork(name) {
      const folderName = uniqueFolderName(
        name,
        new Set([...works.values()].map((work) => work.summary.folderName.toLowerCase())),
      );
      const first = emptyChapter("第一章", null, 0);
      const work: StoredWork = {
        summary: {
          id: createId(),
          name,
          folderName,
          path: `${libraryPath ?? defaultLibraryPath}/${folderName}`,
          recycled: false,
        },
        outline: {
          volumes: [],
          chapters: [
            {
              id: first.id,
              title: first.title,
              status: first.status,
              sortOrder: 0,
              volumeId: null,
            },
          ],
        },
        chapters: new Map([[first.id, first]]),
        session: {
          chapterId: first.id,
          cursorFrom: 1,
          cursorTo: 1,
          scrollTop: 0,
        },
      };
      works.set(work.summary.id, work);
      openId = work.summary.id;
      return opened(work);
    },
    async renameWork(id, name) {
      const work = works.get(id);
      if (work) {
        work.summary.name = name;
      }
    },
    async deleteWork(id) {
      const work = works.get(id);
      if (!work) {
        return;
      }
      works.delete(id);
      work.summary.recycled = true;
      recycled.set(id, work);
      if (openId === id) {
        openId = null;
      }
    },
    async restoreWork(id) {
      const work = recycled.get(id);
      if (!work) {
        return;
      }
      recycled.delete(id);
      work.summary.recycled = false;
      works.set(id, work);
    },
    async permanentlyDeleteWork(id) {
      recycled.delete(id);
      works.delete(id);
    },
    async openWork(id) {
      const work = works.get(id);
      if (!work) {
        throw new Error("找不到这部作品");
      }
      openId = id;
      return opened(work);
    },
    async closeWork() {
      openId = null;
    },
    async createVolume(title) {
      const work = requireOpen();
      const volume: Volume = {
        id: createId(),
        title,
        sortOrder: work.outline.volumes.length,
      };
      const outline = createFirstVolume(work.outline, volume);
      syncOutline(work, outline);
      return structuredClone(work.outline);
    },
    async cancelVolumes() {
      const work = requireOpen();
      syncOutline(work, cancelVolumes(work.outline));
      return structuredClone(work.outline);
    },
    async createChapter(options) {
      const work = requireOpen();
      const draft = emptyChapter("未命名章节", null, 0);
      const outline = insertChapter(
        work.outline,
        {
          id: draft.id,
          title: "",
          status: "初稿",
        },
        options,
      );
      const placed = outline.chapters.find((chapter) => chapter.id === draft.id);
      draft.title = placed?.title ?? "";
      draft.volumeId = placed?.volumeId ?? null;
      draft.sortOrder = placed?.sortOrder ?? 0;
      work.chapters.set(draft.id, draft);
      syncOutline(work, outline);
      work.session.chapterId = draft.id;
      return { outline: structuredClone(work.outline), chapter: toBody(draft) };
    },
    async renameVolume(id, title) {
      const work = requireOpen();
      work.outline.volumes = work.outline.volumes.map((volume) =>
        volume.id === id ? { ...volume, title } : volume,
      );
      return structuredClone(work.outline);
    },
    async renameChapter(id, title) {
      const work = requireOpen();
      syncOutline(work, renameChapter(work.outline, id, title));
      const stored = work.chapters.get(id);
      if (stored) {
        stored.title = title;
      }
      return structuredClone(work.outline);
    },
    async deleteVolume(id) {
      const work = requireOpen();
      const remaining = work.outline.chapters.filter((chapter) => chapter.volumeId !== id);
      work.outline = {
        volumes: work.outline.volumes.filter((volume) => volume.id !== id),
        chapters: remaining,
      };
      for (const [chapterId, chapter] of work.chapters) {
        if (chapter.volumeId === id) {
          work.chapters.delete(chapterId);
        }
      }
      if (work.session.chapterId && !work.chapters.has(work.session.chapterId)) {
        work.session.chapterId = [...work.chapters.keys()][0] ?? null;
      }
      return structuredClone(work.outline);
    },
    async deleteChapter(id) {
      const work = requireOpen();
      syncOutline(work, removeChapter(work.outline, id));
      work.chapters.delete(id);
      if (work.session.chapterId === id) {
        work.session.chapterId = work.outline.chapters[0]?.id ?? null;
      }
      return structuredClone(work.outline);
    },
    async moveChapter(id, direction) {
      const work = requireOpen();
      const chapter = work.outline.chapters.find((item) => item.id === id);
      if (!chapter) {
        return structuredClone(work.outline);
      }
      const siblings = work.outline.chapters
        .filter((item) => item.volumeId === chapter.volumeId)
        .sort((a, b) => a.sortOrder - b.sortOrder);
      const index = siblings.findIndex((item) => item.id === id);
      const swapWith = direction === "up" ? siblings[index - 1] : siblings[index + 1];
      if (!swapWith) {
        return structuredClone(work.outline);
      }
      const currentOrder = chapter.sortOrder;
      chapter.sortOrder = swapWith.sortOrder;
      swapWith.sortOrder = currentOrder;
      syncOutline(work, work.outline);
      return structuredClone(work.outline);
    },
    async setChapterStatus(id, status: ChapterStatus) {
      const work = requireOpen();
      const stored = work.chapters.get(id);
      if (stored) {
        stored.status = status;
      }
      work.outline.chapters = work.outline.chapters.map((chapter) =>
        chapter.id === id ? { ...chapter, status } : chapter,
      );
    },
    async saveChapter(payload) {
      if (failNext) {
        failNext = false;
        throw new Error("保存失败（模拟）");
      }
      const work = requireOpen();
      const stored = work.chapters.get(payload.id);
      if (!stored) {
        throw new Error("找不到这一章");
      }
      stored.title = payload.title;
      stored.body = structuredClone(payload.body);
      stored.wordCount = countDocumentWords(payload.body);
      stored.cursorFrom = payload.cursorFrom;
      stored.cursorTo = payload.cursorTo;
      stored.scrollTop = payload.scrollTop;
      work.session = {
        chapterId: payload.id,
        cursorFrom: payload.cursorFrom,
        cursorTo: payload.cursorTo,
        scrollTop: payload.scrollTop,
      };
      work.outline.chapters = work.outline.chapters.map((chapter) =>
        chapter.id === payload.id ? { ...chapter, title: payload.title } : chapter,
      );
      return { wordCount: stored.wordCount, workWordCount: workWordCount(work) };
    },
    async loadChapter(id) {
      const work = requireOpen();
      const stored = work.chapters.get(id);
      if (!stored) {
        throw new Error("找不到这一章");
      }
      work.session.chapterId = id;
      return toBody(stored);
    },
    async failNextSave() {
      failNext = true;
    },
  };
}
