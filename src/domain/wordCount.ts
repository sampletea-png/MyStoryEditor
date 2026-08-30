const WHITESPACE = /[ \t\n\r\u3000]/;

export function countWords(text: string): number {
  let count = 0;
  for (const ch of text) {
    if (!WHITESPACE.test(ch)) {
      count += 1;
    }
  }
  return count;
}

export type TipTapMark = {
  type: string;
};

export type TipTapNode = {
  type?: string;
  text?: string;
  marks?: TipTapMark[];
  content?: TipTapNode[];
};

export function extractPlainText(node: TipTapNode | null | undefined): string {
  if (!node) {
    return "";
  }
  if (node.type === "hardBreak") {
    return "\n";
  }
  if (typeof node.text === "string") {
    return node.text;
  }
  if (!node.content?.length) {
    return "";
  }
  const parts = node.content.map((child) => extractPlainText(child));
  if (node.type === "paragraph" || node.type === "horizontalRule") {
    return `${parts.join("")}\n`;
  }
  return parts.join("");
}

export function countDocumentWords(doc: TipTapNode | null | undefined): number {
  return countWords(extractPlainText(doc));
}
