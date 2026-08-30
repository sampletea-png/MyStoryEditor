import type { TipTapNode } from "../domain/wordCount";

export const DOCUMENT_SCHEMA_VERSION = 1;

export const EMPTY_DOCUMENT: TipTapNode = {
  type: "doc",
  content: [{ type: "paragraph" }],
};
