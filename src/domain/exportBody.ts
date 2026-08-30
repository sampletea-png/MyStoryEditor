import {
  BorderStyle,
  Document as DocxDocument,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from "docx";
import {
  displayChapterTitle,
  displayVolumeTitle,
  type Outline,
} from "./outline";
import { extractPlainText, type TipTapMark, type TipTapNode } from "./wordCount";

export type BodyExportFormat = "plain" | "markdown" | "docx";

export type ChapterDocument = {
  id: string;
  body: TipTapNode;
};

export type ExportBodyInput = {
  outline: Outline;
  chapters: readonly ChapterDocument[];
  format: BodyExportFormat;
};

const UTF8_BOM = new Uint8Array([0xef, 0xbb, 0xbf]);

type Block =
  | { kind: "heading"; level: 1 | 2; text: string }
  | { kind: "paragraph"; node: TipTapNode }
  | { kind: "rule" };

export async function exportBody(input: ExportBodyInput): Promise<Uint8Array> {
  const blocks = collectBlocks(input.outline, input.chapters);
  if (input.format === "plain") {
    return withUtf8Bom(renderPlain(blocks));
  }
  if (input.format === "markdown") {
    return new TextEncoder().encode(renderMarkdown(blocks));
  }
  if (input.format === "docx") {
    return renderDocx(blocks);
  }
  throw new Error(`unsupported format: ${input.format}`);
}

function withUtf8Bom(text: string): Uint8Array {
  const body = new TextEncoder().encode(text);
  const bytes = new Uint8Array(UTF8_BOM.length + body.length);
  bytes.set(UTF8_BOM, 0);
  bytes.set(body, UTF8_BOM.length);
  return bytes;
}

function renderPlain(blocks: Block[]): string {
  const parts: string[] = [];
  for (const block of blocks) {
    if (block.kind === "heading") {
      parts.push(block.text);
    } else if (block.kind === "paragraph") {
      const text = extractPlainText(block.node).replace(/\n$/, "");
      if (text.length > 0) {
        parts.push(text);
      }
    }
  }
  return parts.join("\n\n") + "\n";
}

function renderMarkdown(blocks: Block[]): string {
  const parts: string[] = [];
  for (const block of blocks) {
    if (block.kind === "heading") {
      parts.push(`${"#".repeat(block.level)} ${block.text}`);
    } else if (block.kind === "rule") {
      parts.push("---");
    } else {
      const text = renderInline(block.node);
      if (text.length > 0) {
        parts.push(text);
      }
    }
  }
  return parts.join("\n\n") + "\n";
}

function renderInline(node: TipTapNode): string {
  if (node.type === "hardBreak") {
    return "  \n";
  }
  if (typeof node.text === "string") {
    return wrapMarks(node.text, node.marks);
  }
  return (node.content ?? []).map(renderInline).join("");
}

async function renderDocx(blocks: Block[]): Promise<Uint8Array> {
  const children = blocks.map((block) => {
    if (block.kind === "heading") {
      return new Paragraph({
        heading: block.level === 1 ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2,
        children: [new TextRun({ text: block.text, font: CJK_FONT })],
      });
    }
    if (block.kind === "rule") {
      return new Paragraph({
        border: {
          bottom: {
            color: "999999",
            space: 1,
            style: BorderStyle.SINGLE,
            size: 12,
          },
        },
      });
    }
    return new Paragraph({ children: inlineRuns(block.node) });
  });

  const document = new DocxDocument({
    styles: {
      default: {
        document: {
          run: { font: CJK_FONT },
        },
      },
    },
    sections: [{ children }],
  });
  const buffer = await Packer.toArrayBuffer(document);
  return new Uint8Array(buffer);
}

function inlineRuns(node: TipTapNode): TextRun[] {
  const runs: TextRun[] = [];
  collectRuns(node, runs);
  return runs;
}

function collectRuns(node: TipTapNode, runs: TextRun[]) {
  if (node.type === "hardBreak") {
    runs.push(new TextRun({ break: 1, font: CJK_FONT }));
    return;
  }
  if (typeof node.text === "string") {
    const types = new Set((node.marks ?? []).map((mark) => mark.type));
    runs.push(
      new TextRun({
        text: node.text,
        bold: types.has("bold"),
        italics: types.has("italic"),
        strike: types.has("strike"),
        font: CJK_FONT,
      }),
    );
    return;
  }
  for (const child of node.content ?? []) {
    collectRuns(child, runs);
  }
}

const CJK_FONT = "Microsoft YaHei";

function wrapMarks(text: string, marks: TipTapMark[] | undefined): string {
  if (!marks?.length) {
    return text;
  }
  const types = new Set(marks.map((mark) => mark.type));
  let result = text;
  if (types.has("strike")) {
    result = `~~${result}~~`;
  }
  if (types.has("italic")) {
    result = `*${result}*`;
  }
  if (types.has("bold")) {
    result = `**${result}**`;
  }
  return result;
}

function collectBlocks(
  outline: Outline,
  chapters: readonly ChapterDocument[],
): Block[] {
  const bodies = new Map(chapters.map((chapter) => [chapter.id, chapter.body]));
  const blocks: Block[] = [];
  const volumes = [...outline.volumes].sort((a, b) => a.sortOrder - b.sortOrder);

  if (volumes.length === 0) {
    for (const chapter of chaptersIn(outline, null)) {
      pushChapter(blocks, 1, chapter.title, bodies.get(chapter.id));
    }
    return blocks;
  }

  for (const volume of volumes) {
    blocks.push({ kind: "heading", level: 1, text: displayVolumeTitle(volume.title) });
    for (const chapter of chaptersIn(outline, volume.id)) {
      pushChapter(blocks, 2, chapter.title, bodies.get(chapter.id));
    }
  }
  return blocks;
}

function chaptersIn(outline: Outline, volumeId: string | null) {
  return outline.chapters
    .filter((chapter) => chapter.volumeId === volumeId)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

function pushChapter(
  blocks: Block[],
  level: 1 | 2,
  title: string,
  body: TipTapNode | undefined,
) {
  blocks.push({ kind: "heading", level, text: displayChapterTitle(title) });
  if (!body?.content) {
    return;
  }
  for (const node of body.content) {
    if (node.type === "horizontalRule") {
      blocks.push({ kind: "rule" });
    } else if (node.type === "paragraph") {
      blocks.push({ kind: "paragraph", node });
    }
  }
}
