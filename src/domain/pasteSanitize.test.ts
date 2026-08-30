import { describe, expect, it } from "vitest";
import { sanitizePastedHtml } from "./pasteSanitize";

describe("sanitizePastedHtml", () => {
  it("keeps paragraphs and basic marks but drops color and font size", () => {
    const html =
      '<p><span style="color:red;font-size:32px;font-family:Comic Sans">你好</span><strong>世界</strong></p>';
    const cleaned = sanitizePastedHtml(html);
    expect(cleaned).toContain("你好");
    expect(cleaned).toContain("<strong>世界</strong>");
    expect(cleaned).not.toContain("color");
    expect(cleaned).not.toContain("font-size");
    expect(cleaned).not.toContain("Comic Sans");
  });
});
