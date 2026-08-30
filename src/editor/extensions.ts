import { Extension } from "@tiptap/core";
import Bold from "@tiptap/extension-bold";
import Document from "@tiptap/extension-document";
import Dropcursor from "@tiptap/extension-dropcursor";
import Gapcursor from "@tiptap/extension-gapcursor";
import HardBreak from "@tiptap/extension-hard-break";
import History from "@tiptap/extension-history";
import HorizontalRule from "@tiptap/extension-horizontal-rule";
import Italic from "@tiptap/extension-italic";
import Paragraph from "@tiptap/extension-paragraph";
import Strike from "@tiptap/extension-strike";
import Text from "@tiptap/extension-text";
import { Plugin } from "@tiptap/pm/state";
import { sanitizePastedHtml } from "../domain/pasteSanitize";

const PasteSanitize = Extension.create({
  name: "pasteSanitize",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          transformPastedHTML(html) {
            return sanitizePastedHtml(html);
          },
        },
      }),
    ];
  },
});

export const writingExtensions = [
  Document,
  Paragraph,
  Text,
  Bold,
  Italic,
  Strike,
  HardBreak,
  HorizontalRule,
  History,
  Dropcursor,
  Gapcursor,
  PasteSanitize,
];
