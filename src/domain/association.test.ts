import { describe, expect, it } from "vitest";
import {
  canonicalizePair,
  findPair,
  isLinkableKind,
  isSelfLink,
  otherEnd,
  pairKey,
  storylineAssociationRollup,
} from "./association";

describe("association pairs", () => {
  const chapter = { kind: "chapter" as const, id: "c1" };
  const character = { kind: "character" as const, id: "r1" };

  it("treats either end order as the same pair", () => {
    expect(pairKey(chapter, character)).toBe(pairKey(character, chapter));
    const [left, right] = canonicalizePair(character, chapter);
    expect(left).toEqual(chapter);
    expect(right).toEqual(character);
  });

  it("finds an existing pair so a second link is not created", () => {
    const existing = { id: "a1", left: chapter, right: character, note: "同乡" };
    expect(findPair([existing], character, chapter)?.id).toBe("a1");
    expect(isSelfLink(chapter, chapter)).toBe(true);
    expect(otherEnd(existing, character)).toEqual(chapter);
  });
});

describe("isLinkableKind", () => {
  it("accepts association kinds and rejects 故事线", () => {
    expect(isLinkableKind("chapter")).toBe(true);
    expect(isLinkableKind("setting")).toBe(true);
    expect(isLinkableKind("storyline")).toBe(false);
  });
});

describe("storylineAssociationRollup", () => {
  it("collects unique chapter, character, and location ends from included events", () => {
    const eventA = { kind: "event" as const, id: "e1" };
    const eventB = { kind: "event" as const, id: "e2" };
    const chapter = { kind: "chapter" as const, id: "c1" };
    const character = { kind: "character" as const, id: "r1" };
    const location = { kind: "location" as const, id: "p1" };
    const setting = { kind: "setting" as const, id: "s1" };
    const rollup = storylineAssociationRollup(
      ["e1", "e2"],
      [
        { left: eventA, right: character },
        { left: chapter, right: eventA },
        { left: eventB, right: character },
        { left: eventA, right: location },
        { left: eventA, right: setting },
        { left: eventA, right: eventB },
      ],
    );
    expect(rollup).toEqual([chapter, character, location]);
  });
});
