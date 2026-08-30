import { describe, expect, it } from "vitest";
import { countDocumentWords, countWords, extractPlainText } from "./wordCount";

describe("countWords", () => {
  it("counts 你好，世界 Hello as 11", () => {
    expect(countWords("你好，世界 Hello")).toBe(11);
  });

  it("ignores newlines, tabs, and ideographic spaces", () => {
    expect(countWords("你\t好\n世\u3000界")).toBe(4);
  });
});

describe("extractPlainText", () => {
  it("joins paragraph text and hard breaks", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "你好" },
            { type: "hardBreak" },
            { type: "text", text: "世界" },
          ],
        },
      ],
    };
    expect(extractPlainText(doc)).toBe("你好\n世界\n");
  });
});

describe("countDocumentWords", () => {
  it("counts a saved chapter document", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "你好，世界 Hello" }],
        },
      ],
    };
    expect(countDocumentWords(doc)).toBe(11);
  });
});
