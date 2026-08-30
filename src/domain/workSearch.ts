import type { TipTapNode } from "./wordCount";

export function queryLength(query: string): number {
  return [...query.trim()].length;
}

export function needsSubstringFallback(query: string): boolean {
  const length = queryLength(query);
  return length > 0 && length <= 2;
}

export function containsQuery(haystack: string, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (needle === "") {
    return false;
  }
  return haystack.toLowerCase().includes(needle);
}

export function snippetAround(text: string, query: string, radius = 18): string {
  const needle = query.trim();
  const index = text.toLowerCase().indexOf(needle.toLowerCase());
  if (index < 0) {
    return text.slice(0, radius * 2);
  }
  const start = Math.max(0, index - radius);
  const end = Math.min(text.length, index + needle.length + radius);
  return `${start > 0 ? "…" : ""}${text.slice(start, end)}${end < text.length ? "…" : ""}`;
}

export function findTextRange(
  doc: TipTapNode,
  query: string,
): { from: number; to: number } | null {
  const needle = query.trim();
  if (!needle) {
    return null;
  }
  const needleLower = needle.toLowerCase();
  let pos = 0;
  for (const child of doc.content ?? []) {
    const found = searchNode(child, pos, needleLower, needle.length);
    if (found) {
      return found;
    }
    pos += nodeSize(child);
  }
  return null;
}

function nodeSize(node: TipTapNode): number {
  if (typeof node.text === "string") {
    return node.text.length;
  }
  if (node.type === "hardBreak" || node.type === "horizontalRule") {
    return 1;
  }
  let inner = 0;
  for (const child of node.content ?? []) {
    inner += nodeSize(child);
  }
  return 2 + inner;
}

function searchNode(
  node: TipTapNode,
  startPos: number,
  needleLower: string,
  needleLength: number,
): { from: number; to: number } | null {
  if (typeof node.text === "string") {
    const index = node.text.toLowerCase().indexOf(needleLower);
    if (index >= 0) {
      return { from: startPos + index, to: startPos + index + needleLength };
    }
    return null;
  }
  if (!node.content?.length) {
    return null;
  }
  if (node.type === "paragraph") {
    return searchInline(node.content, startPos + 1, needleLower, needleLength);
  }
  let pos = startPos + 1;
  for (const child of node.content) {
    const found = searchNode(child, pos, needleLower, needleLength);
    if (found) {
      return found;
    }
    pos += nodeSize(child);
  }
  return null;
}

function searchInline(
  children: readonly TipTapNode[],
  contentPos: number,
  needleLower: string,
  needleLength: number,
): { from: number; to: number } | null {
  let concat = "";
  const indexToPos: number[] = [];
  let pos = contentPos;

  const flush = (): { from: number; to: number } | null => {
    const index = concat.toLowerCase().indexOf(needleLower);
    if (index < 0) {
      return null;
    }
    const from = indexToPos[index];
    const last = indexToPos[index + needleLength - 1];
    if (from === undefined || last === undefined) {
      return null;
    }
    return { from, to: last + 1 };
  };

  for (const child of children) {
    if (typeof child.text === "string") {
      for (let i = 0; i < child.text.length; i += 1) {
        indexToPos.push(pos + i);
        concat += child.text[i];
      }
      pos += child.text.length;
      continue;
    }
    const found = flush();
    if (found) {
      return found;
    }
    concat = "";
    indexToPos.length = 0;
    pos += nodeSize(child);
  }
  return flush();
}
