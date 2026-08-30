import { describe, expect, it } from "vitest";
import { UNCATEGORIZED_ID } from "../domain/settingCategories";
import { displaySettingName } from "../domain/settingNames";
import { storylineAssociationRollup } from "../domain/association";
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

describe("associations and search through AppApi", () => {
  it("keeps one undirected link between a chapter and a character", async () => {
    const api = createMemoryApi();
    const opened = await api.createWork("北境行纪");
    const chapterId = opened.chapter!.id;
    const character = await api.createCharacter();
    const first = await api.createAssociation({
      left: { kind: "chapter", id: chapterId },
      right: { kind: "character", id: character.id },
      note: "同乡",
    });
    const second = await api.createAssociation({
      left: { kind: "character", id: character.id },
      right: { kind: "chapter", id: chapterId },
      note: "同乡",
    });
    expect(second.id).toBe(first.id);
    expect(await api.listAssociations("chapter", chapterId)).toHaveLength(1);
    expect((await api.listAssociations("character", character.id))[0]?.id).toBe(first.id);
  });

  it("finds a two-character name, an alias, and a short chapter phrase", async () => {
    const api = createMemoryApi();
    const opened = await api.createWork("北境行纪");
    const character = await api.createCharacter();
    await api.saveCharacter({ ...character, name: "阿宁", aliases: ["宁儿"], summary: "守关人" });
    await api.saveChapter({
      id: opened.chapter!.id,
      title: opened.chapter!.title,
      body: {
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "雪停之后他才出关" }] }],
      },
      cursorFrom: 1,
      cursorTo: 1,
      scrollTop: 0,
    });
    expect((await api.searchWork("阿宁")).settings.some((item) => item.id === character.id)).toBe(true);
    expect((await api.searchWork("宁儿")).settings.some((item) => item.id === character.id)).toBe(true);
    expect((await api.searchWork("守关人")).settings.some((item) => item.id === character.id)).toBe(true);
    expect((await api.searchWork("他才出关")).chapters.some((item) => item.id === opened.chapter!.id)).toBe(
      true,
    );
  });

  it("refuses to put a storyline into generic associations", async () => {
    const api = createMemoryApi();
    const opened = await api.createWork("北境行纪");
    const line = await api.createStoryline();
    await expect(
      api.createAssociation({
        left: { kind: "storyline" as "chapter", id: line.id },
        right: { kind: "chapter", id: opened.chapter!.id },
        note: "",
      }),
    ).rejects.toThrow("故事线不进入通用关联");
  });

  it("exposes event associations a storyline can roll up as chapter, character, and location", async () => {
    const api = createMemoryApi();
    const opened = await api.createWork("北境行纪");
    const event = await api.createEvent();
    const character = await api.createCharacter();
    const location = await api.createLocation();
    const line = await api.createStoryline();
    await api.addEventToStoryline(line.id, event.id);
    await api.createAssociation({
      left: { kind: "event", id: event.id },
      right: { kind: "chapter", id: opened.chapter!.id },
      note: "",
    });
    await api.createAssociation({
      left: { kind: "event", id: event.id },
      right: { kind: "character", id: character.id },
      note: "",
    });
    await api.createAssociation({
      left: { kind: "event", id: event.id },
      right: { kind: "location", id: location.id },
      note: "",
    });
    const links = await api.listAssociations("event", event.id);
    expect(storylineAssociationRollup([event.id], links)).toEqual([
      { kind: "chapter", id: opened.chapter!.id },
      { kind: "character", id: character.id },
      { kind: "location", id: location.id },
    ]);
  });

  it("counts 你好，世界 Hello as 11 after save", async () => {
    const api = createMemoryApi();
    const opened = await api.createWork("北境行纪");
    const result = await api.saveChapter({
      id: opened.chapter!.id,
      title: opened.chapter!.title,
      body: {
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "你好，世界 Hello" }] }],
      },
      cursorFrom: 1,
      cursorTo: 1,
      scrollTop: 0,
    });
    expect(result.wordCount).toBe(11);
  });
});

const JPEG_BYTES = [0xff, 0xd8, 0xff, 0xe0, 1, 2, 3];
const PNG_BYTES = [0x89, 0x50, 0x4e, 0x47, 9, 8, 7];

describe("work map through AppApi", () => {
  it("shows a jpg map and keeps only the later png", async () => {
    const api = createMemoryApi();
    await api.createWork("北境行纪");
    const jpeg = await api.putWorkMap({ fileName: "北境.jpg", bytes: JPEG_BYTES });
    expect(jpeg.mimeType).toBe("image/jpeg");
    expect(jpeg.bytes).toEqual(JPEG_BYTES);
    expect((await api.getWorkMap())?.mimeType).toBe("image/jpeg");
    const png = await api.putWorkMap({ fileName: "北境.png", bytes: PNG_BYTES });
    expect(png.mimeType).toBe("image/png");
    expect(png.bytes).toEqual(PNG_BYTES);
    const current = await api.getWorkMap();
    expect(current?.mimeType).toBe("image/png");
    expect(current?.bytes).toEqual(PNG_BYTES);
  });

  it("keeps locations after the map is cleared", async () => {
    const api = createMemoryApi();
    await api.createWork("北境行纪");
    const north = await api.createLocation();
    await api.saveLocation({ ...north, name: "北境" });
    await api.putWorkMap({ fileName: "map.webp", bytes: [1, 2, 3, 4] });
    await api.clearWorkMap();
    expect(await api.getWorkMap()).toBeNull();
    const catalog = await api.loadCatalog();
    expect(catalog.locations.find((item) => item.id === north.id)?.name).toBe("北境");
  });

  it("rejects a gif as the work map", async () => {
    const api = createMemoryApi();
    await api.createWork("北境行纪");
    await expect(api.putWorkMap({ fileName: "map.gif", bytes: [1] })).rejects.toThrow(
      "总图只支持 png、jpg 或 webp",
    );
  });
});
