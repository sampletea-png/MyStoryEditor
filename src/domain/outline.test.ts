import { describe, expect, it } from "vitest";
import {
  canCreateChapterAtRoot,
  cancelVolumes,
  createFirstVolume,
  displayChapterTitle,
  insertChapter,
  removeChapter,
  renameChapter,
} from "./outline";

const chapter = (
  id: string,
  title: string,
  sortOrder: number,
  volumeId: string | null = null,
) => ({
  id,
  title,
  status: "初稿" as const,
  sortOrder,
  volumeId,
});

describe("displayChapterTitle", () => {
  it("shows 未命名章节 when the title is empty", () => {
    expect(displayChapterTitle("")).toBe("未命名章节");
    expect(displayChapterTitle("   ")).toBe("未命名章节");
    expect(displayChapterTitle("第一章")).toBe("第一章");
  });
});

describe("createFirstVolume", () => {
  it("moves existing root chapters under the first volume", () => {
    const outline = {
      volumes: [],
      chapters: [chapter("c1", "第一章", 0), chapter("c2", "第二章", 1)],
    };
    const next = createFirstVolume(outline, {
      id: "v1",
      title: "上卷",
      sortOrder: 0,
    });
    expect(next.chapters.every((item) => item.volumeId === "v1")).toBe(true);
    expect(canCreateChapterAtRoot(next)).toBe(false);
  });
});

describe("insertChapter", () => {
  it("inserts a new chapter after the current one", () => {
    const outline = {
      volumes: [],
      chapters: [chapter("c1", "第一章", 0), chapter("c2", "第二章", 1)],
    };
    const next = insertChapter(
      outline,
      { id: "c1b", title: "插章", status: "初稿" },
      { afterChapterId: "c1" },
    );
    expect(next.chapters.sort((a, b) => a.sortOrder - b.sortOrder).map((c) => c.id)).toEqual([
      "c1",
      "c1b",
      "c2",
    ]);
  });

  it("appends to the selected volume when the work is divided", () => {
    const outline = {
      volumes: [{ id: "v1", title: "上卷", sortOrder: 0 }],
      chapters: [chapter("c1", "第一章", 0, "v1")],
    };
    const next = insertChapter(
      outline,
      { id: "c2", title: "第二章", status: "初稿" },
      { selectedVolumeId: "v1" },
    );
    expect(next.chapters.find((item) => item.id === "c2")?.volumeId).toBe("v1");
    expect(canCreateChapterAtRoot(next)).toBe(false);
  });
});

describe("removeChapter", () => {
  it("allows a work with no chapters", () => {
    const outline = {
      volumes: [],
      chapters: [chapter("c1", "第一章", 0)],
    };
    const next = removeChapter(outline, "c1");
    expect(next.chapters).toEqual([]);
  });
});

describe("renameChapter", () => {
  it("keeps an empty title so the tree can show 未命名章节", () => {
    const outline = {
      volumes: [],
      chapters: [chapter("c1", "第一章", 0)],
    };
    const next = renameChapter(outline, "c1", "");
    expect(next.chapters[0]?.title).toBe("");
    expect(displayChapterTitle(next.chapters[0]?.title ?? "")).toBe("未命名章节");
  });
});

describe("cancelVolumes", () => {
  it("lifts every chapter back to the work root", () => {
    const outline = {
      volumes: [{ id: "v1", title: "上卷", sortOrder: 0 }],
      chapters: [chapter("c1", "第一章", 0, "v1")],
    };
    const next = cancelVolumes(outline);
    expect(next.volumes).toEqual([]);
    expect(next.chapters[0]?.volumeId).toBeNull();
    expect(canCreateChapterAtRoot(next)).toBe(true);
  });
});
