import type { ChapterStatus, Outline } from "../domain/outline";
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

export type OpenedWork = {
  work: WorkSummary;
  outline: Outline;
  session: Session;
  chapter: ChapterBody | null;
  workWordCount: number;
  fts5: boolean;
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
};
