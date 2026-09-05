// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMemoryApi, createMemoryApiPair } from "../api/memory";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { RestorePointDialog } from "./RestorePointDialog";
import { LibraryScreen } from "./LibraryScreen";

let root: Root | undefined;
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined;
  document.body.replaceChildren();
});

async function showDialog(api: ReturnType<typeof createMemoryApi>, work: Awaited<ReturnType<typeof api.listWorks>>[number]) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(<RestorePointDialog api={api} work={work} onClose={() => {}} onRestored={() => {}} />));
}

async function clickButton(label: string) {
  const button = [...document.querySelectorAll("button")].find(item => item.textContent === label);
  expect(button, label).toBeDefined();
  await act(async () => button!.click());
}

describe("恢复点对话框", () => {
  it("作品库入口恢复后在列表中显示两部作品", async () => {
    const api = createMemoryApi();
    await api.createWork("北境行纪");
    await api.closeWork();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root!.render(<LibraryScreen api={api} libraryPath="文档/小说作品库"
      onOpenWork={async id => { await api.openWork(id); }} onLibraryPathChange={() => {}} />));
    await clickButton("恢复点");
    await clickButton("恢复为新作品");
    expect((await api.listWorks()).length).toBe(2);
    expect(document.body.textContent).toContain("恢复完成");
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
  it("损坏提示只提供最近可用恢复点的新作品恢复", async () => {
    const api = createMemoryApi();
    const work = await api.createWork("北境行纪");
    await api.closeWork();
    await showDialog(api, { ...work.work, problem: "作品数据包已损坏，无法作为当前作品打开" });
    expect(document.body.textContent).toContain("最近可用恢复点");
    expect([...document.querySelectorAll("button")].some(button => button.textContent?.includes("替换"))).toBe(false);
    await clickButton("恢复为新作品");
    expect(await api.listWorks()).toHaveLength(2);
  });
  it("默认恢复为新作品且不改变原作品", async () => {
    const api = createMemoryApi();
    const work = await api.createWork("北境行纪");
    await api.closeWork();
    await showDialog(api, work.work);
    await clickButton("恢复为新作品");
    const works = await api.listWorks();
    expect(works).toHaveLength(2);
    expect(works.some(item => item.id === work.work.id)).toBe(true);
  });

  it("替换必须再次确认；取消确认不会替换或创建保全点", async () => {
    const api = createMemoryApi();
    const work = await api.createWork("北境行纪");
    await api.closeWork();
    const before = await api.listRestorePoints(work.work.id);
    await showDialog(api, work.work);
    await clickButton("替换当前作品…");
    expect(document.body.textContent).toContain("先为当前作品创建一个手动恢复点");
    expect(await api.listRestorePoints(work.work.id)).toEqual(before);
    await clickButton("取消替换");
    expect(await api.listRestorePoints(work.work.id)).toEqual(before);
    await clickButton("替换当前作品…");
    await clickButton("确认替换当前作品");
    expect(await api.listWorks()).toHaveLength(1);
    expect((await api.listRestorePoints(work.work.id)).filter(item => item.kind === "manual")).toHaveLength(1);
  });
});

describe("从恢复点恢复 / AppApi", () => {
  it("已打开作品从作品库消失后仍能列恢复点并保全失败草稿", async () => {
    const [api, external] = createMemoryApiPair();
    const original = await api.createWork("失效原稿");
    const point = await api.createRestorePoint();
    await external.deleteWork(original.work.id);
    const draft = { ...original.chapter!, title: "待保全草稿" };
    await expect(api.saveChapter(draft)).rejects.toThrow("路径已失效");
    expect(await api.listRestorePoints(original.work.id)).toContainEqual(point);
    const restored = await api.restoreFromPoint(original.work.id, point.folderName, false, draft);
    expect(restored.path).not.toBe(original.work.path);
    expect((await api.openWork(restored.id)).chapter!.title).toBe(draft.title);
  });
  it("恢复为新作品携带未保存的新章节且原稿不变", async () => {
    const api = createMemoryApi();
    const original = await api.createWork("草稿保全");
    const point = await api.createRestorePoint();
    const added = await api.createChapter({});
    const draft = { ...added.chapter, title: "未保存标题", body: { type: "doc", content: [
      { type: "paragraph", content: [{ type: "text", text: "未保存正文" }] },
    ] } };
    const restored = await api.restoreFromPoint(original.work.id, point.folderName, false, draft);
    expect((await api.loadChapter(added.chapter.id)).title).not.toBe(draft.title);
    const opened = await api.openWork(restored.id);
    expect(opened.chapter?.title).toBe(draft.title);
    expect(opened.chapter?.body).toEqual(draft.body);
    expect(opened.outline.chapters).toHaveLength(2);
  });
  afterEach(() => vi.useRealTimers());
  it("替换保留身份并先保全新稿，写作时拒绝替换", async () => {
    const api = createMemoryApi();
    const original = await api.createWork("北境行纪");
    const point = await api.createRestorePoint();
    await api.renameChapter(original.chapter!.id, "替换前的新稿");
    await expect(api.restoreFromPoint(original.work.id, point.folderName, true)).rejects.toThrow("回作品库");
    await api.closeWork();
    const summary = await api.restoreFromPoint(original.work.id, point.folderName, true);
    expect(summary.id).toBe(original.work.id);
    const safeguards = (await api.listRestorePoints(summary.id)).filter(p => p.kind === "manual");
    expect(safeguards).toHaveLength(2);
    const undo = await api.restoreFromPoint(summary.id, safeguards[1].folderName);
    expect((await api.openWork(undo.id)).chapter?.title).toBe("替换前的新稿");
    await api.closeWork();
    expect((await api.openWork(summary.id)).chapter?.title).toBe("第一章");
  });
  it("自动点保留最近十个和最近七日代表，手动点不自动删除", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2020, 0, 1, 8));
    const api = createMemoryApi();
    const work = await api.createWork("保全");
    const manual = await api.createRestorePoint();
    for (let day = 1; day <= 12; day++) {
      for (const hour of [10, 20]) {
        vi.setSystemTime(new Date(2020, 0, day, hour));
        await api.closeWork();
        await api.openWork(work.work.id);
      }
    }
    const points = await api.listRestorePoints();
    expect(points.filter(point => point.kind !== "manual")).toHaveLength(12);
    expect(points.some(point => point.path === manual.path)).toBe(true);
    expect(points.some(point => point.folderName.startsWith("2020-01-06_200000"))).toBe(true);
    expect(points.some(point => point.folderName.startsWith("2020-01-06_100000"))).toBe(false);
  });
  it("恢复为新作品包含打点时的正文、设定、关联、地图和地点标记", async () => {
    const api = createMemoryApi();
    const original = await api.createWork("北境行纪");
    const chapter = original.chapter!;
    await api.saveChapter({ ...chapter, title: "开篇", body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "风过北境" }] }] } });
    await api.createVolume("上卷");
    const character = await api.createCharacter();
    await api.saveCharacter({ ...character, name: "林北" });
    const location = await api.createLocation();
    await api.saveLocation({ ...location, name: "北城", mark: { x: 0.3, y: 0.2 } });
    await api.putWorkMap({ fileName: "map.png", bytes: [1, 2, 3] });
    await api.createAssociation({ left: { kind: "chapter", id: chapter.id }, right: { kind: "character", id: character.id }, note: "同乡" });
    const discarded = await api.createEvent();
    await api.deleteEvent(discarded.id);
    const point = await api.createRestorePoint();
    await api.saveCharacter({ ...character, name: "后来的人名" });
    await api.clearWorkMap();
    const restored = await api.restoreFromPoint(original.work.id, point.folderName);
    expect(restored.id).not.toBe(original.work.id);
    await api.closeWork();
    const opened = await api.openWork(restored.id);
    expect(opened.outline.volumes[0].title).toBe("上卷");
    expect(opened.chapter?.body).toEqual({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "风过北境" }] }] });
    expect(opened.catalog.characters[0].name).toBe("林北");
    expect(opened.catalog.locations[0].mark).toEqual({ x: 0.3, y: 0.2 });
    expect(opened.workMap?.bytes).toEqual([1, 2, 3]);
    expect((await api.listAssociations("chapter", chapter.id))[0].note).toBe("同乡");
    expect((await api.listWorkRecycle()).some(item => item.id === discarded.id)).toBe(true);
    expect((await api.listWorks()).length).toBe(2);
  });
});
