import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryApi } from "../api/memory";
import type { AppApi } from "../api/types";
import { WorkMapOverlay } from "../screens/WorkMapOverlay";

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    disconnect() {}
  });
  vi.stubGlobal("URL", class extends URL {
    static createObjectURL() { return "blob:map"; }
    static revokeObjectURL() {}
  });
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(800);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(600);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function fixture() {
  const api = createMemoryApi();
  await api.createWork("南行记");
  const map = await api.putWorkMap({ fileName: "map.png", bytes: [1] });
  const start = await api.createLocation();
  const end = await api.createLocation();
  await api.saveLocation({ ...start, name: "山门", mark: { x: 0.2, y: 0.3 } });
  await api.saveLocation({ ...end, name: "渡口", mark: { x: 0.8, y: 0.6 } });
  const storyline = await api.createStoryline();
  await api.saveStoryline({ ...storyline, name: "南行" });
  const events = [];
  for (const name of ["离开山门", "林中遇袭", "抵达渡口"]) {
    const event = await api.createEvent();
    await api.saveEvent({ ...event, name });
    await api.addEventToStoryline(storyline.id, event.id);
    events.push(event);
  }
  await api.createAssociation({ left: { kind: "event", id: events[0]!.id }, right: { kind: "location", id: start.id }, note: "" });
  await api.createAssociation({ left: { kind: "event", id: events[2]!.id }, right: { kind: "location", id: end.id }, note: "" });
  await api.createAssociation({ left: { kind: "location", id: start.id }, right: { kind: "location", id: end.id }, note: "不画关系线" });
  return { api, map, catalog: await api.loadCatalog() };
}

async function loadImage() {
  const image = host.querySelector("img")!;
  Object.defineProperties(image, {
    naturalWidth: { value: 800 },
    naturalHeight: { value: 600 },
  });
  await act(async () => image.dispatchEvent(new Event("load")));
}

describe("storyline in WorkMapOverlay", () => {
  it("shows the complete chain and unlocated events while drawing only the selected storyline route", async () => {
    const props = await fixture();
    await act(async () => {
      root.render(<WorkMapOverlay {...props} onMapChange={() => {}} onCatalogChange={() => {}} onClose={() => {}} />);
    });
    await loadImage();

    expect(host.querySelector('select[aria-label="故事线"]')).not.toBeNull();
    expect(Array.from(host.querySelectorAll('[aria-label="事件链"] li')).map((item) => item.textContent)).toEqual([
      "1. 离开山门山门", "2. 林中遇袭未定点", "3. 抵达渡口渡口",
    ]);
    expect(host.querySelector('[aria-label="未定点事件"]')?.textContent).toBe("2. 林中遇袭");
    const route = host.querySelector('svg[aria-label="事件走线"]')!;
    expect(route).not.toBeNull();
    expect(route.querySelectorAll("polyline")).toHaveLength(1);
    expect(route.querySelector("polyline")?.getAttribute("points")).toBe("160,180 640,360");
    expect(Array.from(host.querySelectorAll('[title="1. 离开山门"], [title="3. 抵达渡口"]')).map((item) => item.textContent)).toEqual(["1", "3"]);
  });

  it("switches storylines without retaining the previous route and keeps the chain when the map is cleared", async () => {
    const props = await fixture();
    const empty = await props.api.createStoryline();
    props.catalog = await props.api.loadCatalog();
    const render = (map = props.map) => root.render(<WorkMapOverlay {...props} map={map} onMapChange={() => {}} onCatalogChange={() => {}} onClose={() => {}} />);
    await act(async () => render());
    await loadImage();
    const select = host.querySelector<HTMLSelectElement>('select[aria-label="故事线"]')!;
    await act(async () => {
      select.value = empty.id;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(host.textContent).toContain("这条故事线还没有收录事件。");
    expect(host.querySelector('[aria-label="事件走线"]')).toBeNull();
    await act(async () => {
      select.value = props.catalog.storylines[0].id;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(host.querySelector('[aria-label="事件走线"]')).not.toBeNull();
    await props.api.clearWorkMap();
    props.catalog = await props.api.loadCatalog();
    await act(async () => root.render(<WorkMapOverlay {...props} map={null} onMapChange={() => {}} onCatalogChange={() => {}} onClose={() => {}} />));
    expect(host.querySelectorAll('[aria-label="事件链"] li')).toHaveLength(3);
    expect(host.querySelectorAll('[aria-label="未定点事件"] li')).toHaveLength(3);
    expect(host.querySelector('[aria-label="事件走线"]')).toBeNull();
  });

  it("shows association failures with retry instead of presenting them as unlocated events", async () => {
    const props = await fixture();
    const read = props.api.listAssociations;
    // Failure at the I/O boundary; the domain and component remain real.
    const api: AppApi = { ...props.api, listAssociations: async () => { throw new Error("读取失败"); } };
    await act(async () => root.render(<WorkMapOverlay {...props} api={api} onMapChange={() => {}} onCatalogChange={() => {}} onClose={() => {}} />));
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("读取失败");
    expect(host.querySelector('[aria-label="未定点事件"]')).toBeNull();
    expect(host.querySelectorAll('[aria-label="事件链"] li')).toHaveLength(3);
    api.listAssociations = read;
    const retry = Array.from(host.querySelectorAll("button")).find((button) => button.textContent === "重试")!;
    await act(async () => retry.click());
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(host.querySelector('[aria-label="未定点事件"]')?.textContent).toBe("2. 林中遇袭");
  });
});
