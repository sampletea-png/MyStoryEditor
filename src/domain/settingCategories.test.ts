import { describe, expect, it } from "vitest";
import {
  UNCATEGORIZED_ID,
  UNCATEGORIZED_NAME,
  canDeleteCategory,
  categoryNameTaken,
  presetCategories,
  reassignEntriesOnCategoryDelete,
} from "./settingCategories";

describe("presetCategories", () => {
  it("includes 未分类 plus the four presets", () => {
    const names = presetCategories().map((category) => category.name);
    expect(names).toEqual(["未分类", "势力", "制度", "物种", "规则"]);
    expect(presetCategories().find((category) => category.name === UNCATEGORIZED_NAME)?.system).toBe(
      true,
    );
  });
});

describe("canDeleteCategory", () => {
  it("refuses to delete 未分类", () => {
    const uncategorized = presetCategories().find((category) => category.id === UNCATEGORIZED_ID);
    expect(uncategorized && canDeleteCategory(uncategorized)).toBe(false);
    expect(canDeleteCategory(presetCategories().find((category) => category.name === "势力")!)).toBe(
      true,
    );
  });
});

describe("categoryNameTaken", () => {
  it("rejects a duplicate name in the same work", () => {
    const categories = presetCategories();
    expect(categoryNameTaken(categories, "势力")).toBe(true);
    expect(categoryNameTaken(categories, "气候")).toBe(false);
    expect(categoryNameTaken(categories, "势力", "preset-势力")).toBe(false);
  });
});

describe("reassignEntriesOnCategoryDelete", () => {
  it("moves entries of the deleted category to 未分类", () => {
    const next = reassignEntriesOnCategoryDelete(
      [
        { id: "a", categoryId: "preset-势力" },
        { id: "b", categoryId: "preset-制度" },
      ],
      "preset-势力",
    );
    expect(next).toEqual([
      { id: "a", categoryId: UNCATEGORIZED_ID },
      { id: "b", categoryId: "preset-制度" },
    ]);
  });
});
