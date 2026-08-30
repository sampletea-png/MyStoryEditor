import { describe, expect, it } from "vitest";
import { folderNameFromWorkName, uniqueFolderName } from "./folderName";

describe("folderNameFromWorkName", () => {
  it("keeps a legal Chinese work name", () => {
    expect(folderNameFromWorkName("北境行纪")).toBe("北境行纪");
  });

  it("strips path-illegal characters once at creation", () => {
    expect(folderNameFromWorkName('北境<>:"/\\|?*行纪')).toBe("北境行纪");
  });

  it("falls back when the name is only illegal characters", () => {
    expect(folderNameFromWorkName("???")).toBe("未命名作品");
  });
});

describe("uniqueFolderName", () => {
  it("appends a suffix when the folder already exists", () => {
    expect(uniqueFolderName("北境行纪", new Set(["北境行纪"]))).toBe("北境行纪-2");
    expect(uniqueFolderName("北境行纪", new Set(["北境行纪", "北境行纪-2"]))).toBe(
      "北境行纪-3",
    );
  });
});
