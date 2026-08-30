import { describe, expect, it } from "vitest";
import { UNCATEGORIZED_ID } from "../domain/settingCategories";
import { displaySettingName } from "../domain/settingNames";
import { createMemoryApi } from "./memory";

describe("setting materials through AppApi", () => {
  it("lets a work with no chapters hold all five kinds", async () => {
    const api = createMemoryApi();
    await api.setLibraryPath("文档/小说作品库");
    const opened = await api.createWork("北境行纪");
    for (const chapter of opened.outline.chapters) {
      await api.deleteChapter(chapter.id);
    }
    await api.createCharacter();
    await api.createLocation();
    await api.createEvent();
    await api.createStoryline();
    await api.createSettingEntry();
    const catalog = await api.loadCatalog();
    expect(catalog.characters).toHaveLength(1);
    expect(catalog.locations).toHaveLength(1);
    expect(catalog.events).toHaveLength(1);
    expect(catalog.storylines).toHaveLength(1);
    expect(catalog.settings).toHaveLength(1);
    expect((await api.openWork(opened.work.id)).outline.chapters).toEqual([]);
  });

  it("keeps an empty-named character in the list as 未命名角色", async () => {
    const api = createMemoryApi();
    await api.createWork("北境行纪");
    const character = await api.createCharacter();
    await api.saveCharacter({ ...character, name: "" });
    const catalog = await api.loadCatalog();
    expect(catalog.characters).toHaveLength(1);
    expect(displaySettingName("character", catalog.characters[0]!.name)).toBe("未命名角色");
  });

  it("moves entries to 未分类 when 势力 is deleted and refuses to delete 未分类", async () => {
    const api = createMemoryApi();
    await api.createWork("北境行纪");
    await api.createSettingEntry("preset-势力");
    const catalog = await api.deleteCategory("preset-势力");
    expect(catalog.settings[0]?.categoryId).toBe(UNCATEGORIZED_ID);
    expect(catalog.categories.some((item) => item.name === "势力")).toBe(false);
    await expect(api.deleteCategory(UNCATEGORIZED_ID)).rejects.toThrow("未分类");
  });

  it("still lists an event after removing it from a storyline", async () => {
    const api = createMemoryApi();
    await api.createWork("北境行纪");
    const event = await api.createEvent();
    const line = await api.createStoryline();
    await api.addEventToStoryline(line.id, event.id);
    await api.removeEventFromStoryline(line.id, event.id);
    const catalog = await api.loadCatalog();
    expect(catalog.events.map((item) => item.id)).toContain(event.id);
    expect(catalog.storylines[0]?.eventIds).toEqual([]);
  });

  it("promotes child locations when the parent is deleted", async () => {
    const api = createMemoryApi();
    await api.createWork("北境行纪");
    const north = await api.createLocation();
    await api.saveLocation({ ...north, name: "北境" });
    const city = await api.createLocation(north.id);
    const inn = await api.createLocation(city.id);
    const catalog = await api.deleteLocation(city.id);
    expect(catalog.locations.find((item) => item.id === inn.id)?.parentId).toBe(north.id);
    expect(catalog.locations.some((item) => item.id === city.id)).toBe(false);
    const recycle = await api.listWorkRecycle();
    expect(recycle.some((item) => item.id === city.id && item.kind === "location")).toBe(true);
  });
});
