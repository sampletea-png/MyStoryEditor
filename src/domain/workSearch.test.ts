import { describe, expect, it } from "vitest";
import { containsQuery, findTextRange, needsSubstringFallback, snippetAround } from "./workSearch";
import type { TipTapNode } from "./wordCount";

describe("needsSubstringFallback", () => {
  it("requires a fallback for one- and two-character Chinese queries", () => {
    expect(needsSubstringFallback("阿宁")).toBe(true);
    expect(needsSubstringFallback("关")).toBe(true);
    expect(needsSubstringFallback("北境关隘")).toBe(false);
    expect(needsSubstringFallback("")).toBe(false);
  });
});

describe("containsQuery", () => {
  it("matches a two-character name, an alias, and a chapter phrase", () => {
    expect(containsQuery("阿宁", "阿宁")).toBe(true);
    expect(containsQuery("宁儿 北境使", "宁儿")).toBe(true);
    expect(containsQuery("雪停之后他才出关", "他才出关")).toBe(true);
    expect(containsQuery("雪停之后", "南疆")).toBe(false);
  });
});

describe("snippetAround", () => {
  it("keeps the matched phrase in the snippet", () => {
    expect(snippetAround("雪停之后他才出关回城", "他才出关")).toContain("他才出关");
  });
});

describe("findTextRange", () => {
  it("finds a query that spans adjacent bold and italic text nodes", () => {
    const doc: TipTapNode = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "他才" },
            { type: "text", text: "出关" },
          ],
        },
      ],
    };
    expect(findTextRange(doc, "他才出关")).toEqual({ from: 1, to: 5 });
  });

  it("does not join a query across paragraphs", () => {
    const doc: TipTapNode = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "他才" }] },
        { type: "paragraph", content: [{ type: "text", text: "出关" }] },
      ],
    };
    expect(findTextRange(doc, "他才出关")).toBeNull();
  });

  it("counts an empty paragraph as a block when locating a later match", () => {
    const doc: TipTapNode = {
      type: "doc",
      content: [
        { type: "paragraph" },
        {
          type: "paragraph",
          content: [
            { type: "text", text: "他才" },
            { type: "text", text: "出关" },
          ],
        },
      ],
    };
    expect(findTextRange(doc, "他才出关")).toEqual({ from: 3, to: 7 });
  });
});
