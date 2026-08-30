import { describe, expect, it } from "vitest";
import { createMemoryApi } from "./memory";
import type { ExportFileHost } from "./exportFiles";
import type { TipTapNode } from "../domain/wordCount";

function paragraph(text: string): TipTapNode {
  return {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  };
}

function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder("utf-8").decode(bytes);
}

function recordingHost(overrides: Partial<ExportFileHost> = {}) {
  const written = new Map<string, Uint8Array>();
  const host: ExportFileHost = {
    pickSavePath: async (suggestedName) => `文档/${suggestedName}`,
    exists: async () => false,
    confirmOverwrite: async () => true,
    writeBytes: async (path, bytes) => {
      written.set(path, bytes);
    },
    ...overrides,
  };
  return { host, written };
}

describe("exportBody through AppApi", () => {
  it("exports the whole work as Markdown using the work name as the default file", async () => {
    const { host, written } = recordingHost();
    const suggested: string[] = [];
    host.pickSavePath = async (name) => {
      suggested.push(name);
      return `文档/${name}`;
    };
    const api = createMemoryApi({ exportFiles: host });
    const opened = await api.createWork("北境行纪");
    await api.saveChapter({
      id: opened.chapter!.id,
      title: "第一章",
      body: paragraph("关外起风了"),
      cursorFrom: 1,
      cursorTo: 1,
      scrollTop: 0,
    });

    const result = await api.exportBody({ format: "markdown" });

    expect(suggested).toEqual(["北境行纪.md"]);
    expect(result).toEqual({ status: "saved", path: "文档/北境行纪.md" });
    expect(decodeUtf8(written.get("文档/北境行纪.md")!)).toBe("# 第一章\n\n关外起风了\n");
  });

  it("strips path-illegal characters from the default file name", async () => {
    const suggested: string[] = [];
    const { host } = recordingHost({
      pickSavePath: async (name) => {
        suggested.push(name);
        return `文档/${name}`;
      },
    });
    const api = createMemoryApi({ exportFiles: host });
    await api.createWork('北境<>:"/\\|?*行纪');

    await api.exportBody({ format: "plain" });

    expect(suggested).toEqual(["北境行纪.txt"]);
  });

  it("can export one volume and leave the other out", async () => {
    const { host, written } = recordingHost();
    const api = createMemoryApi({ exportFiles: host });
    const opened = await api.createWork("北境行纪");
    const firstId = opened.chapter!.id;
    await api.saveChapter({
      id: firstId,
      title: "第一章",
      body: paragraph("上卷正文"),
      cursorFrom: 1,
      cursorTo: 1,
      scrollTop: 0,
    });
    const outlineWithVolume = await api.createVolume("上卷");
    const upperId = outlineWithVolume.volumes[0]!.id;
    const lower = await api.createVolume("下卷");
    const lowerId = lower.volumes[1]!.id;
    const second = await api.createChapter({ selectedVolumeId: lowerId });
    await api.renameChapter(second.chapter.id, "第二章");
    await api.saveChapter({
      id: second.chapter.id,
      title: "第二章",
      body: paragraph("下卷正文"),
      cursorFrom: 1,
      cursorTo: 1,
      scrollTop: 0,
    });

    await api.exportBody({ format: "markdown", volumeIds: [upperId] });

    expect(decodeUtf8(written.get("文档/北境行纪.md")!)).toBe(
      "# 上卷\n\n## 第一章\n\n上卷正文\n",
    );
  });

  it("can export one chapter and leave the rest out", async () => {
    const { host, written } = recordingHost();
    const api = createMemoryApi({ exportFiles: host });
    const opened = await api.createWork("北境行纪");
    await api.saveChapter({
      id: opened.chapter!.id,
      title: "第一章",
      body: paragraph("先写这一章"),
      cursorFrom: 1,
      cursorTo: 1,
      scrollTop: 0,
    });
    const second = await api.createChapter({ afterChapterId: opened.chapter!.id });
    await api.renameChapter(second.chapter.id, "第二章");
    await api.saveChapter({
      id: second.chapter.id,
      title: "第二章",
      body: paragraph("只导出这一章"),
      cursorFrom: 1,
      cursorTo: 1,
      scrollTop: 0,
    });

    await api.exportBody({ format: "markdown", chapterIds: [second.chapter.id] });

    expect(decodeUtf8(written.get("文档/北境行纪.md")!)).toBe("# 第二章\n\n只导出这一章\n");
  });

  it("exports nothing from the outline when chapterIds is an empty list", async () => {
    const { host, written } = recordingHost();
    const api = createMemoryApi({ exportFiles: host });
    const opened = await api.createWork("北境行纪");
    await api.saveChapter({
      id: opened.chapter!.id,
      title: "第一章",
      body: paragraph("关外起风了"),
      cursorFrom: 1,
      cursorTo: 1,
      scrollTop: 0,
    });

    await api.exportBody({ format: "markdown", chapterIds: [] });

    expect(decodeUtf8(written.get("文档/北境行纪.md")!)).toBe("\n");
  });

  it("asks to overwrite when the target already exists", async () => {
    const asked: string[] = [];
    const { host, written } = recordingHost({
      exists: async (path) => path === "文档/北境行纪.md",
      confirmOverwrite: async (path) => {
        asked.push(path);
        return true;
      },
    });
    const api = createMemoryApi({ exportFiles: host });
    await api.createWork("北境行纪");

    const result = await api.exportBody({ format: "markdown" });

    expect(asked).toEqual(["文档/北境行纪.md"]);
    expect(result).toEqual({ status: "saved", path: "文档/北境行纪.md" });
    expect(written.has("文档/北境行纪.md")).toBe(true);
  });

  it("does not write when overwrite is declined", async () => {
    const { host, written } = recordingHost({
      exists: async () => true,
      confirmOverwrite: async () => false,
    });
    const api = createMemoryApi({ exportFiles: host });
    await api.createWork("北境行纪");

    const result = await api.exportBody({ format: "markdown" });

    expect(result).toEqual({ status: "overwrite-declined" });
    expect(written.size).toBe(0);
  });

  it("does not write when the save dialog is cancelled", async () => {
    const { host, written } = recordingHost({
      pickSavePath: async () => null,
    });
    const api = createMemoryApi({ exportFiles: host });
    await api.createWork("北境行纪");

    const result = await api.exportBody({ format: "markdown" });

    expect(result).toEqual({ status: "cancelled" });
    expect(written.size).toBe(0);
  });

  it("omits 设定, 事件, 关联, 章节状态, and 作品回收站 from the file", async () => {
    const { host, written } = recordingHost();
    const api = createMemoryApi({ exportFiles: host });
    const opened = await api.createWork("北境行纪");
    await api.saveChapter({
      id: opened.chapter!.id,
      title: "第一章",
      body: paragraph("关外起风了"),
      cursorFrom: 1,
      cursorTo: 1,
      scrollTop: 0,
    });
    await api.setChapterStatus(opened.chapter!.id, "定稿");
    const extra = await api.createChapter({ afterChapterId: opened.chapter!.id });
    await api.renameChapter(extra.chapter.id, "回收章");
    await api.saveChapter({
      id: extra.chapter.id,
      title: "回收章",
      body: paragraph("不该出现的回收正文"),
      cursorFrom: 1,
      cursorTo: 1,
      scrollTop: 0,
    });
    await api.deleteChapter(extra.chapter.id);
    const character = await api.createCharacter();
    await api.saveCharacter({ ...character, name: "守关人阿宁", summary: "设定摘要不该出现" });
    const event = await api.createEvent();
    await api.saveEvent({ ...event, name: "密会", summary: "事件摘要不该出现" });
    const setting = await api.createSettingEntry();
    await api.saveSettingEntry({ ...setting, name: "北境律法", summary: "设定条目不该出现" });
    await api.createAssociation({
      left: { kind: "chapter", id: opened.chapter!.id },
      right: { kind: "character", id: character.id },
      note: "关联说明不该出现",
    });

    await api.exportBody({ format: "markdown" });
    const text = decodeUtf8(written.get("文档/北境行纪.md")!);

    expect(text).toBe("# 第一章\n\n关外起风了\n");
    expect(text).not.toContain("定稿");
    expect(text).not.toContain("守关人阿宁");
    expect(text).not.toContain("密会");
    expect(text).not.toContain("北境律法");
    expect(text).not.toContain("关联说明不该出现");
    expect(text).not.toContain("回收章");
    expect(text).not.toContain("不该出现的回收正文");
  });
});
