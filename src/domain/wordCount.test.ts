import { describe, expect, it } from "vitest";
import { countDocumentWords, countWords, extractPlainText } from "./wordCount";

describe("countWords", () => {
  it("counts 你好，世界 Hello without the space", () => {
    // 你 好 ， 世 界 Hello = 10。规格验收句写 11，与「不含空格」规则不一致，以规则为准。
    expect(countWords("你好，世界 Hello")).toBe(10);
  });

  it("ignores spaces, newlines, and tabs", () => {
    expect(countWords("你\t好\n世 界")).toBe(4);
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
    expect(countDocumentWords(doc)).toBe(10);
  });
});
