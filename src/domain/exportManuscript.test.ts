import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { exportManuscript } from "./exportManuscript";
import type { Outline } from "./outline";
import type { TipTapNode } from "./wordCount";

const chapter = (
  id: string,
  title: string,
  sortOrder: number,
  volumeId: string | null,
  status: "初稿" | "修订中" | "定稿" = "初稿",
) => ({ id, title, status, sortOrder, volumeId });

const text = (value: string, marks?: { type: string }[]): TipTapNode =>
  marks ? { type: "text", text: value, marks } : { type: "text", text: value };

const formattedBody: TipTapNode = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [
        text("你好", [{ type: "bold" }]),
        text(" "),
        text("世界", [{ type: "italic" }]),
      ],
    },
    { type: "horizontalRule" },
    {
      type: "paragraph",
      content: [text("删掉", [{ type: "strike" }])],
    },
  ],
};

const secondBody: TipTapNode = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [text("只留文字")],
    },
  ],
};

/** Outline order is scrambled; export must follow sortOrder, 上卷 then 下卷. */
const outline: Outline = {
  volumes: [
    { id: "v2", title: "下卷", sortOrder: 1 },
    { id: "v1", title: "上卷", sortOrder: 0 },
  ],
  chapters: [
    chapter("c2", "第二章", 0, "v2", "定稿"),
    chapter("c1", "第一章", 0, "v1"),
  ],
};

const chapters = [
  { id: "c1", body: formattedBody },
  { id: "c2", body: secondBody },
];

function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder("utf-8").decode(bytes);
}

describe("exportManuscript", () => {
  it("writes UTF-8 BOM plain text with titles, no marks, and no 定稿", async () => {
    const bytes = await exportManuscript({ outline, chapters, format: "plain" });
    expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(decodeUtf8(bytes.subarray(3))).toBe(
      "上卷\n\n第一章\n\n你好 世界\n\n删掉\n\n下卷\n\n第二章\n\n只留文字\n",
    );
  });

  it("writes UTF-8 Markdown with heading titles and mark syntax, without BOM or 定稿", async () => {
    const bytes = await exportManuscript({ outline, chapters, format: "markdown" });
    expect([...bytes.subarray(0, 3)]).not.toEqual([0xef, 0xbb, 0xbf]);
    expect(decodeUtf8(bytes)).toBe(
      "# 上卷\n\n## 第一章\n\n**你好** *世界*\n\n---\n\n~~删掉~~\n\n# 下卷\n\n## 第二章\n\n只留文字\n",
    );
  });

  it("writes a real DOCX with Chinese headings and bold italic strike", async () => {
    const bytes = await exportManuscript({ outline, chapters, format: "docx" });
    expect([...bytes.subarray(0, 2)]).toEqual([0x50, 0x4b]);
    const zip = await JSZip.loadAsync(bytes);
    const types = await zip.file("[Content_Types].xml")?.async("string");
    expect(types).toContain(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml",
    );
    const xml = await zip.file("word/document.xml")?.async("string");
    expect(xml).toBeTruthy();
    expect(xml).toContain("上卷");
    expect(xml).toContain("第一章");
    expect(xml).toContain("你好");
    expect(xml).toContain("世界");
    expect(xml).toContain("删掉");
    expect(xml).toContain("只留文字");
    expect(xml).not.toContain("定稿");
    expect(xml).toMatch(/Heading1/);
    expect(xml).toMatch(/Heading2/);
    expect(xml).toMatch(/<w:b[\s/>]/);
    expect(xml).toMatch(/<w:i[\s/>]/);
    expect(xml).toMatch(/<w:strike[\s/>]/);
  });

  it("uses 未命名卷 and 未命名章节 for blank titles", async () => {
    const bytes = await exportManuscript({
      outline: {
        volumes: [{ id: "v1", title: "  ", sortOrder: 0 }],
        chapters: [chapter("c1", "", 0, "v1")],
      },
      chapters: [{ id: "c1", body: { type: "doc", content: [{ type: "paragraph" }] } }],
      format: "markdown",
    });
    const text = decodeUtf8(bytes);
    expect(text).toContain("# 未命名卷");
    expect(text).toContain("## 未命名章节");
  });

  it("exports a work without volumes as chapter titles only", async () => {
    const bytes = await exportManuscript({
      outline: {
        volumes: [],
        chapters: [chapter("c1", "第一章", 0, null)],
      },
      chapters: [
        {
          id: "c1",
          body: {
            type: "doc",
            content: [{ type: "paragraph", content: [text("正文")] }],
          },
        },
      ],
      format: "plain",
    });
    expect(decodeUtf8(bytes.subarray(3))).toBe("第一章\n\n正文\n");
  });
});
