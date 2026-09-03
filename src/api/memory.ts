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
import {
  canDeleteCategory,
  categoryNameTaken,
  presetCategories,
  reassignEntriesOnCategoryDelete,
  UNCATEGORIZED_ID,
  type SettingCategory,
} from "../domain/settingCategories";
import { promoteLocationChildren, wouldCreateLocationCycle } from "../domain/locationTree";
import { includeEventOnce, excludeEvent, moveStorylineEvent as moveEventIds } from "../domain/storyline";
import {
  type Character,
  type Location,
  type RecycleItem,
  type RecycleKind,
  type SettingCatalog,
  type SettingEntry,
  type StoryEvent,
  type Storyline,
} from "../domain/setting";
import {
  canonicalizePair,
  findPair,
  isLinkableKind,
  isSelfLink,
  type Association,
} from "../domain/association";
import { containsQuery, snippetAround } from "../domain/workSearch";
import {
  mapImageKindFromFileName,
  mapImageMimeType,
} from "../domain/workMap";
import { EMPTY_DOCUMENT } from "../editor/schema";
import { countDocumentWords, extractPlainText, type TipTapNode } from "../domain/wordCount";
import { browserDownloadFiles, runBodyExport, type ExportFileHost } from "./exportFiles";
import type { AppApi, ChapterBody, OpenedWork, RestoreKind, RestorePoint, Session, WorkMapImage, WorkSummary } from "./types";

export type MemoryApiOptions = {
  exportFiles?: ExportFileHost;
};

type StoredChapter = Chapter & {
  body: TipTapNode;
  documentSchemaVersion: number;
  wordCount: number;
  cursorFrom: number;
  cursorTo: number;
  scrollTop: number;
  deletedAt: number | null;
};

type Soft<T> = T & { deletedAt: number | null };

type RecycledVolume = {
  volume: Volume;
  deletedAt: number;
  chapterIds: string[];
};

type StoredWork = {
  summary: WorkSummary;
  outline: Outline;
  chapters: Map<string, StoredChapter>;
  recycledVolumes: RecycledVolume[];
  session: Session;
  categories: SettingCategory[];
  characters: Map<string, Soft<Character>>;
  locations: Map<string, Soft<Location>>;
  events: Map<string, Soft<StoryEvent>>;
  storylines: Map<string, Soft<Storyline>>;
  settings: Map<string, Soft<SettingEntry>>;
  associations: Soft<Association>[];
  workMap: WorkMapImage | null;
  restorePoints: RestorePoint[];
};

function createId() {
  return crypto.randomUUID();
}

function nowTs() {
  return Math.floor(Date.now() / 1000);
}

function emptyChapter(title: string, volumeId: string | null, sortOrder: number): StoredChapter {
  return {
    id: createId(),
    title,
    status: "初稿",
    volumeId,
    sortOrder,
    body: structuredClone(EMPTY_DOCUMENT),
    documentSchemaVersion: 1,
    wordCount: 0,
    cursorFrom: 1,
    cursorTo: 1,
    scrollTop: 0,
    deletedAt: null,
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

function liveChapters(work: StoredWork) {
  return [...work.chapters.values()].filter((chapter) => chapter.deletedAt === null);
}

function workWordCount(work: StoredWork): number {
  return liveChapters(work).reduce((sum, chapter) => sum + chapter.wordCount, 0);
}

function cloneItem<T>(item: T): T {
  return structuredClone(item);
}

function catalogOf(work: StoredWork): SettingCatalog {
  const live = <T,>(items: Map<string, Soft<T>>): T[] =>
    [...items.values()]
      .filter((item) => item.deletedAt === null)
      .map(({ deletedAt: _deletedAt, ...item }) => cloneItem(item as T));
  return {
    categories: cloneItem(work.categories),
    characters: live(work.characters),
    locations: live(work.locations),
    events: live(work.events),
    storylines: live(work.storylines),
    settings: live(work.settings),
  };
}

function opened(work: StoredWork): OpenedWork {
  const chapter = work.session.chapterId
    ? work.chapters.get(work.session.chapterId)
    : liveChapters(work)[0];
  const usable = chapter && chapter.deletedAt === null ? chapter : liveChapters(work)[0];
  return {
    work: { ...work.summary },
    outline: structuredClone(work.outline),
    session: { ...work.session },
    chapter: usable ? toBody(usable) : null,
    workWordCount: workWordCount(work),
    fts5: true,
    catalog: catalogOf(work),
    workMap: work.workMap ? { mimeType: work.workMap.mimeType, bytes: [...work.workMap.bytes] } : null,
  };
}

function emptyWorkFields() {
  return {
    recycledVolumes: [] as RecycledVolume[],
    categories: presetCategories(),
    characters: new Map<string, Soft<Character>>(),
    locations: new Map<string, Soft<Location>>(),
    events: new Map<string, Soft<StoryEvent>>(),
    storylines: new Map<string, Soft<Storyline>>(),
    settings: new Map<string, Soft<SettingEntry>>(),
    associations: [] as Soft<Association>[],
    workMap: null as WorkMapImage | null,
    restorePoints: [] as RestorePoint[],
  };
}

type WorkArchiveSnapshot = {
  name: string;
  outline: Outline;
  chapters: StoredChapter[];
  recycledVolumes: RecycledVolume[];
  session: Session;
  categories: SettingCategory[];
  characters: Soft<Character>[];
  locations: Soft<Location>[];
  events: Soft<StoryEvent>[];
  storylines: Soft<Storyline>[];
  settings: Soft<SettingEntry>[];
  associations: Soft<Association>[];
};

function snapshotWork(work: StoredWork): WorkArchiveSnapshot {
  return {
    name: work.summary.name,
    outline: structuredClone(work.outline),
    chapters: [...work.chapters.values()].map((chapter) => structuredClone(chapter)),
    recycledVolumes: structuredClone(work.recycledVolumes),
    session: { ...work.session },
    categories: structuredClone(work.categories),
    characters: [...work.characters.values()].map((item) => structuredClone(item)),
    locations: [...work.locations.values()].map((item) => structuredClone(item)),
    events: [...work.events.values()].map((item) => structuredClone(item)),
    storylines: [...work.storylines.values()].map((item) => structuredClone(item)),
    settings: [...work.settings.values()].map((item) => structuredClone(item)),
    associations: structuredClone(work.associations),
  };
}

function workFromSnapshot(snapshot: WorkArchiveSnapshot, folderName: string, library: string): StoredWork {
  const chapters = new Map(snapshot.chapters.map((chapter) => [chapter.id, structuredClone(chapter)]));
  return {
    summary: {
      id: createId(),
      name: snapshot.name,
      folderName,
      path: `${library}/${folderName}`,
      recycled: false,
      problem: null,
    },
    outline: structuredClone(snapshot.outline),
    chapters,
    recycledVolumes: structuredClone(snapshot.recycledVolumes),
    session: { ...snapshot.session },
    categories: structuredClone(snapshot.categories),
    characters: new Map(snapshot.characters.map((item) => [item.id, structuredClone(item)])),
    locations: new Map(
      snapshot.locations.map((item) => [item.id, { ...structuredClone(item), mark: item.mark ?? null }]),
    ),
    events: new Map(snapshot.events.map((item) => [item.id, structuredClone(item)])),
    storylines: new Map(snapshot.storylines.map((item) => [item.id, structuredClone(item)])),
    settings: new Map(snapshot.settings.map((item) => [item.id, structuredClone(item)])),
    associations: structuredClone(snapshot.associations),
    workMap: null,
    restorePoints: [],
  };
}

function encodeArchive(snapshot: WorkArchiveSnapshot): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(snapshot));
}

function decodeArchive(archive: Uint8Array): WorkArchiveSnapshot {
  return JSON.parse(new TextDecoder().decode(archive)) as WorkArchiveSnapshot;
}

function restorePointsDir(work: StoredWork): string {
  const parent = work.summary.path.replace(/[/\\][^/\\]+$/, "");
  return `${parent}/${work.summary.folderName}.恢复点`;
}

function restoreKindLabel(kind: RestoreKind): string {
  switch (kind) {
    case "manual":
      return "手动";
    case "auto":
      return "自动";
    case "migration":
      return "迁移";
  }
}

function nextRestoreFolderName(work: StoredWork, kind: RestoreKind): string {
  const now = new Date();
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-")
    + "_"
    + [now.getHours(), now.getMinutes(), now.getSeconds()]
      .map((part) => String(part).padStart(2, "0"))
      .join("");
  const base = `${stamp}-${restoreKindLabel(kind)}`;
  const used = new Set(work.restorePoints.map((item) => item.folderName.toLowerCase()));
  if (!used.has(base.toLowerCase())) {
    return base;
  }
  let n = 2;
  while (used.has(`${base}-${n}`.toLowerCase())) {
    n += 1;
  }
  return `${base}-${n}`;
}

function todayStamp(): string {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
}

function addRestorePoint(work: StoredWork, kind: RestoreKind): RestorePoint {
  const folderName = nextRestoreFolderName(work, kind);
  const point: RestorePoint = {
    path: `${restorePointsDir(work)}/${folderName}`,
    folderName,
    createdAt: new Date().toISOString(),
    kind,
  };
  work.restorePoints.push(point);
  return point;
}

function ensureDailyRestorePoint(work: StoredWork): RestorePoint | null {
  const today = todayStamp();
  if (work.restorePoints.some((item) => item.folderName.startsWith(today))) {
    return null;
  }
  return addRestorePoint(work, "auto");
}

function displayRecycleName(kind: RecycleKind, name: string): string {
  if (name.trim() !== "") {
    return name;
  }
  switch (kind) {
    case "volume":
      return "未命名卷";
    case "chapter":
      return "未命名章节";
    case "character":
      return "未命名角色";
    case "location":
      return "未命名地点";
    case "event":
      return "未命名事件";
    case "storyline":
      return "未命名故事线";
    case "setting":
      return "未命名设定";
  }
}

type MemoryShared = {
  libraryPath: string | null;
  works: Map<string, StoredWork>;
  recycled: Map<string, StoredWork>;
  locks: Map<string, symbol>;
};

function createMemoryShared(): MemoryShared {
  return {
    libraryPath: null,
    works: new Map(),
    recycled: new Map(),
    locks: new Map(),
  };
}

export function createMemoryApi(options: MemoryApiOptions = {}): AppApi {
  return bindMemoryApi(createMemoryShared(), options);
}

export function createMemoryApiPair(): [AppApi, AppApi] {
  const shared = createMemoryShared();
  return [bindMemoryApi(shared), bindMemoryApi(shared)];
}

function bindMemoryApi(shared: MemoryShared, options: MemoryApiOptions = {}): AppApi {
  const holder = Symbol();
  const defaultLibraryPath = "文档/小说作品库";
  const works = shared.works;
  const recycled = shared.recycled;
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

  const acquireLock = (path: string) => {
    const current = shared.locks.get(path);
    if (current && current !== holder) {
      throw new Error("该作品已在其他窗口打开");
    }
    shared.locks.set(path, holder);
  };

  const releaseLock = () => {
    if (!openId) {
      return;
    }
    const work = works.get(openId) ?? recycled.get(openId);
    if (work && shared.locks.get(work.summary.path) === holder) {
      shared.locks.delete(work.summary.path);
    }
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
    for (const [id, stored] of work.chapters) {
      if (stored.deletedAt !== null) {
        continue;
      }
      if (!outline.chapters.some((chapter) => chapter.id === id)) {
        stored.deletedAt = nowTs();
      }
    }
  };

  const live = <T,>(items: Map<string, Soft<T>>) =>
    [...items.values()].filter((item) => item.deletedAt === null);

  const listRecycle = (work: StoredWork): RecycleItem[] => {
    const items: RecycleItem[] = [];
    for (const entry of work.recycledVolumes) {
      items.push({
        id: entry.volume.id,
        kind: "volume",
        name: displayRecycleName("volume", entry.volume.title),
        deletedAt: entry.deletedAt,
      });
    }
    for (const chapter of work.chapters.values()) {
      if (chapter.deletedAt === null) {
        continue;
      }
      if (work.recycledVolumes.some((entry) => entry.chapterIds.includes(chapter.id))) {
        continue;
      }
      items.push({
        id: chapter.id,
        kind: "chapter",
        name: displayRecycleName("chapter", chapter.title),
        deletedAt: chapter.deletedAt,
      });
    }
    const push = <T extends { id: string; name: string }>(kind: RecycleKind, records: Map<string, Soft<T>>) => {
      for (const item of records.values()) {
        if (item.deletedAt !== null) {
          items.push({
            id: item.id,
            kind,
            name: displayRecycleName(kind, item.name),
            deletedAt: item.deletedAt,
          });
        }
      }
    };
    push("character", work.characters);
    push("location", work.locations);
    push("event", work.events);
    push("storyline", work.storylines);
    push("setting", work.settings);
    return items.sort((a, b) => b.deletedAt - a.deletedAt);
  };

  return {
    async getBootstrap() {
      return { libraryPath: shared.libraryPath, defaultLibraryPath };
    },
    async setLibraryPath(path) {
      shared.libraryPath = path;
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
          path: `${shared.libraryPath ?? defaultLibraryPath}/${folderName}`,
          recycled: false,
          problem: null,
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
        ...emptyWorkFields(),
      };
      works.set(work.summary.id, work);
      releaseLock();
      acquireLock(work.summary.path);
      openId = work.summary.id;
      ensureDailyRestorePoint(work);
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
        releaseLock();
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
      if (openId !== id) {
        releaseLock();
      }
      acquireLock(work.summary.path);
      openId = id;
      ensureDailyRestorePoint(work);
      return opened(work);
    },
    async closeWork() {
      if (openId) {
        const work = works.get(openId);
        if (work) {
          addRestorePoint(work, "auto");
        }
      }
      releaseLock();
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
      const ts = nowTs();
      for (const volume of work.outline.volumes) {
        work.recycledVolumes.push({ volume, deletedAt: ts, chapterIds: [] });
      }
      syncOutline(work, cancelVolumes(work.outline));
      return structuredClone(work.outline);
    },
    async createChapter(options) {
      const work = requireOpen();
      const draft = emptyChapter("", null, 0);
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
      const volume = work.outline.volumes.find((item) => item.id === id);
      const ts = nowTs();
      const chapterIds = work.outline.chapters
        .filter((chapter) => chapter.volumeId === id)
        .map((chapter) => chapter.id);
      if (volume) {
        work.recycledVolumes.push({ volume, deletedAt: ts, chapterIds });
      }
      for (const chapterId of chapterIds) {
        const stored = work.chapters.get(chapterId);
        if (stored) {
          stored.deletedAt = ts;
        }
      }
      work.outline = {
        volumes: work.outline.volumes.filter((item) => item.id !== id),
        chapters: work.outline.chapters.filter((chapter) => chapter.volumeId !== id),
      };
      if (work.session.chapterId && !work.outline.chapters.some((chapter) => chapter.id === work.session.chapterId)) {
        work.session.chapterId = work.outline.chapters[0]?.id ?? null;
      }
      return structuredClone(work.outline);
    },
    async deleteChapter(id) {
      const work = requireOpen();
      const stored = work.chapters.get(id);
      if (stored) {
        stored.deletedAt = nowTs();
      }
      syncOutline(work, removeChapter(work.outline, id));
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
      if (!stored || stored.deletedAt !== null) {
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
      if (!stored || stored.deletedAt !== null) {
        throw new Error("找不到这一章");
      }
      work.session.chapterId = id;
      return toBody(stored);
    },
    async failNextSave() {
      failNext = true;
    },
    async loadCatalog() {
      return catalogOf(requireOpen());
    },
    async createCharacter() {
      const work = requireOpen();
      const item: Soft<Character> = {
        id: createId(),
        name: "",
        aliases: [],
        summary: "",
        appearance: structuredClone(EMPTY_DOCUMENT),
        personality: structuredClone(EMPTY_DOCUMENT),
        background: structuredClone(EMPTY_DOCUMENT),
        deletedAt: null,
      };
      work.characters.set(item.id, item);
      return cloneItem(item);
    },
    async saveCharacter(payload) {
      const work = requireOpen();
      const stored = work.characters.get(payload.id);
      if (!stored || stored.deletedAt !== null) {
        throw new Error("找不到这个角色");
      }
      Object.assign(stored, cloneItem(payload), { deletedAt: null });
    },
    async deleteCharacter(id) {
      const stored = requireOpen().characters.get(id);
      if (!stored || stored.deletedAt !== null) {
        throw new Error("找不到要删除的条目");
      }
      stored.deletedAt = nowTs();
    },
    async createLocation(parentId) {
      const work = requireOpen();
      if (parentId && !live(work.locations).some((item) => item.id === parentId)) {
        throw new Error("找不到上级地点");
      }
      const item: Soft<Location> = {
        id: createId(),
        name: "",
        summary: "",
        description: structuredClone(EMPTY_DOCUMENT),
        parentId: parentId ?? null,
        mark: null,
        deletedAt: null,
      };
      work.locations.set(item.id, item);
      return cloneItem(item);
    },
    async saveLocation(payload) {
      const work = requireOpen();
      const stored = work.locations.get(payload.id);
      if (!stored || stored.deletedAt !== null) {
        throw new Error("找不到这个地点");
      }
      const nodes = live(work.locations).map((item) =>
        item.id === payload.id ? { id: item.id, parentId: payload.parentId } : item,
      );
      if (wouldCreateLocationCycle(nodes, payload.id, payload.parentId)) {
        throw new Error("地点不能形成环");
      }
      Object.assign(stored, cloneItem(payload), { deletedAt: null });
      return catalogOf(work);
    },
    async deleteLocation(id) {
      const work = requireOpen();
      const stored = work.locations.get(id);
      if (!stored || stored.deletedAt !== null) {
        throw new Error("找不到要删除的条目");
      }
      const liveLocations = live(work.locations);
      const promoted = promoteLocationChildren(liveLocations, id);
      for (const location of work.locations.values()) {
        if (location.deletedAt !== null) {
          continue;
        }
        const next = promoted.find((item) => item.id === location.id);
        if (next) {
          location.parentId = next.parentId;
        }
      }
      stored.deletedAt = nowTs();
      return catalogOf(work);
    },
    async createEvent() {
      const work = requireOpen();
      const item: Soft<StoryEvent> = {
        id: createId(),
        name: "",
        summary: "",
        description: structuredClone(EMPTY_DOCUMENT),
        storyTime: "",
        deletedAt: null,
      };
      work.events.set(item.id, item);
      return cloneItem(item);
    },
    async saveEvent(payload) {
      const work = requireOpen();
      const stored = work.events.get(payload.id);
      if (!stored || stored.deletedAt !== null) {
        throw new Error("找不到这个事件");
      }
      Object.assign(stored, cloneItem(payload), { deletedAt: null });
    },
    async deleteEvent(id) {
      const stored = requireOpen().events.get(id);
      if (!stored || stored.deletedAt !== null) {
        throw new Error("找不到要删除的条目");
      }
      stored.deletedAt = nowTs();
    },
    async createStoryline() {
      const work = requireOpen();
      const item: Soft<Storyline> = {
        id: createId(),
        name: "",
        summary: "",
        eventIds: [],
        deletedAt: null,
      };
      work.storylines.set(item.id, item);
      return cloneItem(item);
    },
    async saveStoryline(payload) {
      const stored = requireOpen().storylines.get(payload.id);
      if (!stored || stored.deletedAt !== null) {
        throw new Error("找不到这条故事线");
      }
      stored.name = payload.name;
      stored.summary = payload.summary;
    },
    async deleteStoryline(id) {
      const stored = requireOpen().storylines.get(id);
      if (!stored || stored.deletedAt !== null) {
        throw new Error("找不到要删除的条目");
      }
      stored.deletedAt = nowTs();
    },
    async addEventToStoryline(storylineId, eventId) {
      const work = requireOpen();
      const line = work.storylines.get(storylineId);
      const event = work.events.get(eventId);
      if (!line || line.deletedAt !== null) {
        throw new Error("找不到这条故事线");
      }
      if (!event || event.deletedAt !== null) {
        throw new Error("找不到这个事件");
      }
      line.eventIds = includeEventOnce(line.eventIds, eventId);
      return cloneItem(line);
    },
    async removeEventFromStoryline(storylineId, eventId) {
      const line = requireOpen().storylines.get(storylineId);
      if (!line || line.deletedAt !== null) {
        throw new Error("找不到这条故事线");
      }
      line.eventIds = excludeEvent(line.eventIds, eventId);
      return cloneItem(line);
    },
    async moveStorylineEvent(storylineId, eventId, direction) {
      const line = requireOpen().storylines.get(storylineId);
      if (!line || line.deletedAt !== null) {
        throw new Error("找不到这条故事线");
      }
      line.eventIds = moveEventIds(line.eventIds, eventId, direction);
      return cloneItem(line);
    },
    async createSettingEntry(categoryId) {
      const work = requireOpen();
      const category = categoryId ?? UNCATEGORIZED_ID;
      if (!work.categories.some((item) => item.id === category)) {
        throw new Error("找不到这个分类");
      }
      const item: Soft<SettingEntry> = {
        id: createId(),
        name: "",
        categoryId: category,
        summary: "",
        body: structuredClone(EMPTY_DOCUMENT),
        deletedAt: null,
      };
      work.settings.set(item.id, item);
      return cloneItem(item);
    },
    async saveSettingEntry(payload) {
      const work = requireOpen();
      const stored = work.settings.get(payload.id);
      if (!stored || stored.deletedAt !== null) {
        throw new Error("找不到这条设定");
      }
      if (!work.categories.some((item) => item.id === payload.categoryId)) {
        throw new Error("找不到这个分类");
      }
      Object.assign(stored, cloneItem(payload), { deletedAt: null });
    },
    async deleteSettingEntry(id) {
      const stored = requireOpen().settings.get(id);
      if (!stored || stored.deletedAt !== null) {
        throw new Error("找不到要删除的条目");
      }
      stored.deletedAt = nowTs();
    },
    async createCategory(name) {
      const work = requireOpen();
      const trimmed = name.trim();
      if (!trimmed) {
        throw new Error("分类名不能为空");
      }
      if (categoryNameTaken(work.categories, trimmed)) {
        throw new Error("同一作品内分类名不可重复");
      }
      const category: SettingCategory = {
        id: createId(),
        name: trimmed,
        sortOrder: work.categories.reduce((max, item) => Math.max(max, item.sortOrder), -1) + 1,
        system: false,
      };
      work.categories.push(category);
      return { ...category };
    },
    async renameCategory(id, name) {
      const work = requireOpen();
      const category = work.categories.find((item) => item.id === id);
      if (!category || !canDeleteCategory(category)) {
        throw new Error("找不到这个分类");
      }
      const trimmed = name.trim();
      if (!trimmed) {
        throw new Error("分类名不能为空");
      }
      if (categoryNameTaken(work.categories, trimmed, id)) {
        throw new Error("同一作品内分类名不可重复");
      }
      category.name = trimmed;
    },
    async deleteCategory(id) {
      const work = requireOpen();
      const category = work.categories.find((item) => item.id === id);
      if (!category || !canDeleteCategory(category)) {
        throw new Error(category?.system ? "无法删除「未分类」" : "找不到这个分类");
      }
      work.categories = work.categories.filter((item) => item.id !== id);
      for (const entry of work.settings.values()) {
        const [next] = reassignEntriesOnCategoryDelete([entry], id);
        if (next) {
          entry.categoryId = next.categoryId;
        }
      }
      return catalogOf(work);
    },
    async listWorkRecycle() {
      return listRecycle(requireOpen());
    },
    async restoreRecycleItem(kind, id) {
      const work = requireOpen();
      if (kind === "volume") {
        const index = work.recycledVolumes.findIndex((entry) => entry.volume.id === id);
        if (index < 0) {
          throw new Error("回收站里找不到这项");
        }
        const [entry] = work.recycledVolumes.splice(index, 1);
        if (!entry) {
          throw new Error("回收站里找不到这项");
        }
        work.outline.volumes.push(entry.volume);
        for (const chapterId of entry.chapterIds) {
          const chapter = work.chapters.get(chapterId);
          if (chapter) {
            chapter.deletedAt = null;
            if (!work.outline.chapters.some((item) => item.id === chapterId)) {
              work.outline.chapters.push({
                id: chapter.id,
                title: chapter.title,
                status: chapter.status,
                sortOrder: chapter.sortOrder,
                volumeId: chapter.volumeId,
              });
            }
          }
        }
      } else if (kind === "chapter") {
        const chapter = work.chapters.get(id);
        if (!chapter || chapter.deletedAt === null) {
          throw new Error("回收站里找不到这项");
        }
        if (chapter.volumeId && !work.outline.volumes.some((volume) => volume.id === chapter.volumeId)) {
          chapter.volumeId = null;
        }
        chapter.deletedAt = null;
        work.outline.chapters.push({
          id: chapter.id,
          title: chapter.title,
          status: chapter.status,
          sortOrder: chapter.sortOrder,
          volumeId: chapter.volumeId,
        });
      } else {
        const maps: Record<
          Exclude<RecycleKind, "volume" | "chapter">,
          Map<string, Soft<{ id: string }>>
        > = {
          character: work.characters,
          location: work.locations,
          event: work.events,
          storyline: work.storylines,
          setting: work.settings,
        };
        const stored = maps[kind].get(id) as Soft<{ id: string; parentId?: string | null }> | undefined;
        if (!stored || stored.deletedAt === null) {
          throw new Error("回收站里找不到这项");
        }
        if (kind === "location" && stored.parentId) {
          const parent = work.locations.get(stored.parentId);
          if (!parent || parent.deletedAt !== null) {
            stored.parentId = null;
          }
        }
        stored.deletedAt = null;
      }
      return { catalog: catalogOf(work), outline: structuredClone(work.outline) };
    },
    async permanentlyDeleteRecycleItem(kind, id) {
      const work = requireOpen();
      if (kind === "volume") {
        const index = work.recycledVolumes.findIndex((entry) => entry.volume.id === id);
        if (index < 0) {
          return;
        }
        const [entry] = work.recycledVolumes.splice(index, 1);
        for (const chapterId of entry?.chapterIds ?? []) {
          work.chapters.delete(chapterId);
        }
        return;
      }
      if (kind === "chapter") {
        work.chapters.delete(id);
        return;
      }
      if (kind === "storyline") {
        work.storylines.delete(id);
        return;
      }
      if (kind === "event") {
        for (const line of work.storylines.values()) {
          line.eventIds = excludeEvent(line.eventIds, id);
        }
        work.events.delete(id);
        return;
      }
      if (kind === "location") {
        for (const location of work.locations.values()) {
          if (location.parentId === id) {
            location.parentId = null;
          }
        }
        work.locations.delete(id);
        return;
      }
      if (kind === "character") {
        work.characters.delete(id);
        return;
      }
      work.settings.delete(id);
    },
    async searchWork(query) {
      const work = requireOpen();
      const needle = query.trim();
      if (!needle) {
        return { chapters: [], settings: [] };
      }
      const chapters = liveChapters(work)
        .filter(
          (chapter) =>
            containsQuery(chapter.title, needle) || containsQuery(extractPlainText(chapter.body), needle),
        )
        .map((chapter) => ({
          id: chapter.id,
          title: chapter.title,
          snippet: snippetAround(`${chapter.title}\n${extractPlainText(chapter.body)}`, needle),
          query: needle,
        }));
      const settings = [
        ...live(work.characters)
          .filter(
            (item) =>
              containsQuery(item.name, needle) ||
              containsQuery(item.summary, needle) ||
              item.aliases.some((alias) => containsQuery(alias, needle)),
          )
          .map((item) => ({
            kind: "character" as const,
            id: item.id,
            name: item.name,
            snippet: snippetAround([item.summary, ...item.aliases].filter(Boolean).join("、"), needle),
          })),
        ...namedHits(live(work.locations), "location", needle),
        ...namedHits(live(work.events), "event", needle),
        ...namedHits(live(work.storylines), "storyline", needle),
        ...namedHits(live(work.settings), "setting", needle),
      ];
      return { chapters, settings };
    },
    async listAssociations(kind, id) {
      const work = requireOpen();
      return work.associations
        .filter((item) => item.deletedAt === null)
        .filter(
          (item) =>
            (item.left.kind === kind && item.left.id === id) ||
            (item.right.kind === kind && item.right.id === id),
        )
        .filter((item) => liveRef(work, item.left) && liveRef(work, item.right))
        .map((item) => cloneItem({ id: item.id, left: item.left, right: item.right, note: item.note }));
    },
    async createAssociation(payload) {
      const work = requireOpen();
      if (isSelfLink(payload.left, payload.right)) {
        throw new Error("不能与自身建立关联");
      }
      if (!isLinkableKind(payload.left.kind) || !isLinkableKind(payload.right.kind)) {
        throw new Error("故事线不进入通用关联");
      }
      if (!liveRef(work, payload.left) || !liveRef(work, payload.right)) {
        throw new Error("关联的两端必须都还在");
      }
      const [left, right] = canonicalizePair(payload.left, payload.right);
      const existing = findPair(work.associations, left, right);
      if (existing) {
        existing.deletedAt = null;
        existing.note = payload.note;
        existing.left = left;
        existing.right = right;
        return cloneItem({ id: existing.id, left, right, note: payload.note });
      }
      const created: Soft<Association> = {
        id: createId(),
        left,
        right,
        note: payload.note,
        deletedAt: null,
      };
      work.associations.push(created);
      return cloneItem({ id: created.id, left, right, note: created.note });
    },
    async updateAssociationNote(id, note) {
      const item = requireOpen().associations.find((entry) => entry.id === id && entry.deletedAt === null);
      if (!item) {
        throw new Error("找不到这条关联");
      }
      item.note = note;
    },
    async deleteAssociation(id) {
      const item = requireOpen().associations.find((entry) => entry.id === id && entry.deletedAt === null);
      if (!item) {
        throw new Error("找不到这条关联");
      }
      item.deletedAt = nowTs();
    },
    async exportWorkArchive(id) {
      const work = works.get(id);
      if (!work) {
        throw new Error("找不到这部作品");
      }
      return encodeArchive(snapshotWork(work));
    },
    async importWorkArchive(archive) {
      const snapshot = decodeArchive(archive);
      const folderName = uniqueFolderName(
        snapshot.name,
        new Set([...works.values()].map((work) => work.summary.folderName.toLowerCase())),
      );
      const work = workFromSnapshot(snapshot, folderName, shared.libraryPath ?? defaultLibraryPath);
      works.set(work.summary.id, work);
      openId = work.summary.id;
      return opened(work);
    },
    async getWorkMap() {
      const map = requireOpen().workMap;
      return map ? { mimeType: map.mimeType, bytes: [...map.bytes] } : null;
    },
    async putWorkMap(payload) {
      const work = requireOpen();
      const kind = mapImageKindFromFileName(payload.fileName);
      work.workMap = {
        mimeType: mapImageMimeType(kind),
        bytes: [...payload.bytes],
      };
      return { mimeType: work.workMap.mimeType, bytes: [...work.workMap.bytes] };
    },
    async clearWorkMap() {
      const work = requireOpen();
      work.workMap = null;
      for (const location of work.locations.values()) {
        location.mark = null;
      }
    },
    async createRestorePoint() {
      return addRestorePoint(requireOpen(), "manual");
    },
    async listRestorePoints() {
      return requireOpen().restorePoints.map((item) => ({ ...item }));
    },
    async exportBody(request) {
      const work = requireOpen();
      const files = options.exportFiles ?? browserDownloadFiles();
      const chapters = liveChapters(work).map((chapter) => ({
        id: chapter.id,
        body: structuredClone(chapter.body),
      }));
      return runBodyExport(
        {
          workName: work.summary.name,
          outline: structuredClone(work.outline),
          chapters,
          request,
        },
        files,
      );
    },
  };
}

function namedHits(
  items: { id: string; name: string; summary: string }[],
  kind: "location" | "event" | "storyline" | "setting",
  needle: string,
) {
  return items
    .filter((item) => containsQuery(item.name, needle) || containsQuery(item.summary, needle))
    .map((item) => ({
      kind,
      id: item.id,
      name: item.name,
      snippet: snippetAround(`${item.name}\n${item.summary}`, needle),
    }));
}

function liveRef(
  work: StoredWork,
  ref: { kind: string; id: string },
): boolean {
  if (ref.kind === "chapter") {
    return work.chapters.get(ref.id)?.deletedAt === null;
  }
  const maps: Record<string, Map<string, Soft<{ id: string }>>> = {
    character: work.characters,
    location: work.locations,
    event: work.events,
    setting: work.settings,
  };
  return maps[ref.kind]?.get(ref.id)?.deletedAt === null;
}
