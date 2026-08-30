import type { ChapterStatus, Outline } from "../domain/outline";
import type { Association, LinkRef } from "../domain/association";
import type {
  Character,
  Location,
  RecycleItem,
  RecycleKind,
  SettingCatalog,
  SettingCategory,
  SettingEntry,
  StoryEvent,
  Storyline,
} from "../domain/setting";
import type { TipTapNode } from "../domain/wordCount";

export type WorkSummary = {
  id: string;
  name: string;
  folderName: string;
  path: string;
  recycled: boolean;
};

export type Session = {
  chapterId: string | null;
  cursorFrom: number;
  cursorTo: number;
  scrollTop: number;
};

export type ChapterBody = {
  id: string;
  title: string;
  status: ChapterStatus;
  body: TipTapNode;
  documentSchemaVersion: number;
  wordCount: number;
  cursorFrom: number;
  cursorTo: number;
  scrollTop: number;
};

export type Bootstrap = {
  libraryPath: string | null;
  defaultLibraryPath: string;
};

export type WorkMapImage = {
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  bytes: number[];
};

export type OpenedWork = {
  work: WorkSummary;
  outline: Outline;
  session: Session;
  chapter: ChapterBody | null;
  workWordCount: number;
  fts5: boolean;
  catalog: SettingCatalog;
  workMap: WorkMapImage | null;
};

export type RestoreResult = {
  catalog: SettingCatalog;
  outline: Outline;
};

export type ChapterHit = {
  id: string;
  title: string;
  snippet: string;
  query: string;
};

export type SettingHit = {
  kind: "character" | "location" | "event" | "storyline" | "setting";
  id: string;
  name: string;
  snippet: string;
};

export type SearchResults = {
  chapters: ChapterHit[];
  settings: SettingHit[];
};

export type AppApi = {
  getBootstrap: () => Promise<Bootstrap>;
  setLibraryPath: (path: string) => Promise<void>;
  pickDirectory: (defaultPath?: string) => Promise<string | null>;
  listWorks: () => Promise<WorkSummary[]>;
  listRecycledWorks: () => Promise<WorkSummary[]>;
  createWork: (name: string) => Promise<OpenedWork>;
  renameWork: (id: string, name: string) => Promise<void>;
  deleteWork: (id: string) => Promise<void>;
  restoreWork: (id: string) => Promise<void>;
  permanentlyDeleteWork: (id: string) => Promise<void>;
  openWork: (id: string) => Promise<OpenedWork>;
  closeWork: () => Promise<void>;
  createVolume: (title: string) => Promise<Outline>;
  cancelVolumes: () => Promise<Outline>;
  createChapter: (options: {
    afterChapterId?: string | null;
    selectedVolumeId?: string | null;
  }) => Promise<{ outline: Outline; chapter: ChapterBody }>;
  renameVolume: (id: string, title: string) => Promise<Outline>;
  renameChapter: (id: string, title: string) => Promise<Outline>;
  deleteVolume: (id: string) => Promise<Outline>;
  deleteChapter: (id: string) => Promise<Outline>;
  moveChapter: (id: string, direction: "up" | "down") => Promise<Outline>;
  setChapterStatus: (id: string, status: ChapterStatus) => Promise<void>;
  saveChapter: (payload: {
    id: string;
    title: string;
    body: TipTapNode;
    cursorFrom: number;
    cursorTo: number;
    scrollTop: number;
  }) => Promise<{ wordCount: number; workWordCount: number }>;
  loadChapter: (id: string) => Promise<ChapterBody>;
  failNextSave: () => Promise<void>;
  loadCatalog: () => Promise<SettingCatalog>;
  createCharacter: () => Promise<Character>;
  saveCharacter: (payload: Character) => Promise<void>;
  deleteCharacter: (id: string) => Promise<void>;
  createLocation: (parentId?: string | null) => Promise<Location>;
  saveLocation: (payload: Location) => Promise<SettingCatalog>;
  deleteLocation: (id: string) => Promise<SettingCatalog>;
  createEvent: () => Promise<StoryEvent>;
  saveEvent: (payload: StoryEvent) => Promise<void>;
  deleteEvent: (id: string) => Promise<void>;
  createStoryline: () => Promise<Storyline>;
  saveStoryline: (payload: { id: string; name: string; summary: string }) => Promise<void>;
  deleteStoryline: (id: string) => Promise<void>;
  addEventToStoryline: (storylineId: string, eventId: string) => Promise<Storyline>;
  removeEventFromStoryline: (storylineId: string, eventId: string) => Promise<Storyline>;
  moveStorylineEvent: (
    storylineId: string,
    eventId: string,
    direction: "up" | "down",
  ) => Promise<Storyline>;
  createSettingEntry: (categoryId?: string | null) => Promise<SettingEntry>;
  saveSettingEntry: (payload: SettingEntry) => Promise<void>;
  deleteSettingEntry: (id: string) => Promise<void>;
  createCategory: (name: string) => Promise<SettingCategory>;
  renameCategory: (id: string, name: string) => Promise<void>;
  deleteCategory: (id: string) => Promise<SettingCatalog>;
  listWorkRecycle: () => Promise<RecycleItem[]>;
  restoreRecycleItem: (kind: RecycleKind, id: string) => Promise<RestoreResult>;
  permanentlyDeleteRecycleItem: (kind: RecycleKind, id: string) => Promise<void>;
  searchWork: (query: string) => Promise<SearchResults>;
  listAssociations: (kind: LinkRef["kind"], id: string) => Promise<Association[]>;
  createAssociation: (payload: {
    left: LinkRef;
    right: LinkRef;
    note: string;
  }) => Promise<Association>;
  updateAssociationNote: (id: string, note: string) => Promise<void>;
  deleteAssociation: (id: string) => Promise<void>;
  getWorkMap: () => Promise<WorkMapImage | null>;
  putWorkMap: (payload: { fileName: string; bytes: number[] }) => Promise<WorkMapImage>;
  clearWorkMap: () => Promise<void>;
};
