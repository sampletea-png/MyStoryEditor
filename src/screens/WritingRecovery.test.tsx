// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createMemoryApi } from "../api/memory";
import { WritingScreen } from "./WritingScreen";

let root: Root | undefined;
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined;
  document.body.replaceChildren();
  vi.useRealTimers();
});

async function click(label: string) {
  const button = [...document.querySelectorAll("button")].find(button => button.textContent === label);
  expect(button, label).toBeDefined();
  await act(async () => button!.click());
}

it("failed save keeps the draft through cancelled/failed recovery and opens the recovered copy with it", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers();
  const api = createMemoryApi();
  const initial = await api.createWork("路径失效");
  const left = vi.fn();
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(<WritingScreen api={api} initial={initial} onBackToLibrary={left} />));
  const title = document.querySelector<HTMLInputElement>(".chapter-title")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(title, "未保存的新标题");
    title.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await api.failNextSave();
  await act(async () => { await vi.advanceTimersByTimeAsync(3200); });
  expect(document.body.textContent).toContain("保存失败");
  await click("回作品库");
  expect(left).not.toHaveBeenCalled();
  await click("从恢复点保全草稿…");
  await click("关闭");
  expect(document.querySelector<HTMLInputElement>(".chapter-title")!.value).toBe("未保存的新标题");
  await click("从恢复点保全草稿…");
  // Failure at the external AppApi seam, not a mocked editor or autosave implementation.
  const restore = api.restoreFromPoint;
  api.restoreFromPoint = async () => { throw new Error("恢复目标不可写"); };
  await click("恢复为新作品");
  expect(document.body.textContent).toContain("恢复目标不可写");
  expect(document.querySelector<HTMLInputElement>(".chapter-title")!.value).toBe("未保存的新标题");
  api.restoreFromPoint = restore;
  await click("恢复为新作品");
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(document.querySelector<HTMLInputElement>(".chapter-title")!.value).toBe("未保存的新标题");
  expect((await api.loadChapter(initial.chapter!.id)).title).toBe("未保存的新标题");
  expect(await api.listWorks()).toHaveLength(2);
  await api.closeWork();
  expect((await api.openWork(initial.work.id)).chapter!.title).toBe("第一章");
});
