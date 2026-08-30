import { describe, expect, it } from "vitest";
import { matchesCharacterQuery, matchesNameQuery } from "./settingFilter";

describe("matchesNameQuery", () => {
  it("filters by name immediately and treats an empty query as match-all", () => {
    expect(matchesNameQuery("北境", "")).toBe(true);
    expect(matchesNameQuery("北境关隘", "关")).toBe(true);
    expect(matchesNameQuery("北境关隘", "南")).toBe(false);
  });
});

describe("matchesCharacterQuery", () => {
  it("also matches a character alias", () => {
    const character = { name: "阿宁", aliases: ["宁儿", "北境使"] };
    expect(matchesCharacterQuery(character, "宁儿")).toBe(true);
    expect(matchesCharacterQuery(character, "阿宁")).toBe(true);
    expect(matchesCharacterQuery(character, "南疆")).toBe(false);
  });
});
