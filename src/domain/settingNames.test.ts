import { describe, expect, it } from "vitest";
import { displaySettingName } from "./settingNames";

describe("displaySettingName", () => {
  it("shows the empty-name label for each kind", () => {
    expect(displaySettingName("character", "")).toBe("未命名角色");
    expect(displaySettingName("location", "   ")).toBe("未命名地点");
    expect(displaySettingName("event", "")).toBe("未命名事件");
    expect(displaySettingName("storyline", "")).toBe("未命名故事线");
    expect(displaySettingName("setting", "")).toBe("未命名设定");
  });

  it("keeps a given name", () => {
    expect(displaySettingName("character", "阿宁")).toBe("阿宁");
  });
});
