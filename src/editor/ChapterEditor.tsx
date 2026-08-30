import { EditorContent, useEditor } from "@tiptap/react";
import { useEffect, useRef } from "react";
import type { TipTapNode } from "../domain/wordCount";
import { writingExtensions } from "./extensions";

type Props = {
  chapterId: string;
  document: TipTapNode;
  cursorFrom: number;
  cursorTo: number;
  scrollTop: number;
  composing: boolean;
  onComposingChange: (composing: boolean) => void;
  onUpdate: (payload: {
    document: TipTapNode;
    cursorFrom: number;
    cursorTo: number;
    scrollTop: number;
    composing: boolean;
  }) => void;
};

export function ChapterEditor({
  chapterId,
  document,
  cursorFrom,
  cursorTo,
  scrollTop,
  composing,
  onComposingChange,
  onUpdate,
}: Props) {
  const skipEmit = useRef(true);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const composingRef = useRef(composing);
  composingRef.current = composing;

  const editor = useEditor({
    extensions: writingExtensions,
    content: document,
    editorProps: {
      attributes: {
        class: "chapter-editor",
        spellcheck: "false",
      },
    },
    onUpdate: ({ editor: instance }) => {
      if (skipEmit.current) {
        return;
      }
      const { from, to } = instance.state.selection;
      onUpdate({
        document: instance.getJSON() as TipTapNode,
        cursorFrom: from,
        cursorTo: to,
        scrollTop: scrollRef.current?.scrollTop ?? 0,
        composing: instance.view.composing || composingRef.current,
      });
    },
    onSelectionUpdate: ({ editor: instance }) => {
      if (skipEmit.current || instance.view.composing || composingRef.current) {
        return;
      }
      const { from, to } = instance.state.selection;
      onUpdate({
        document: instance.getJSON() as TipTapNode,
        cursorFrom: from,
        cursorTo: to,
        scrollTop: scrollRef.current?.scrollTop ?? 0,
        composing: false,
      });
    },
  });

  useEffect(() => {
    if (!editor) {
      return;
    }
    skipEmit.current = true;
    editor.commands.setContent(document, false);
    const maxPos = editor.state.doc.content.size;
    const from = Math.min(Math.max(cursorFrom, 1), maxPos);
    const to = Math.min(Math.max(cursorTo, 1), maxPos);
    editor.commands.setTextSelection({ from, to });
    requestAnimationFrame(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollTop;
      }
      skipEmit.current = false;
    });
  }, [editor, chapterId]);

  useEffect(() => {
    const root = scrollRef.current;
    if (!root) {
      return;
    }
    const onCompositionStart = () => onComposingChange(true);
    const onCompositionEnd = () => {
      onComposingChange(false);
      if (!editor || skipEmit.current) {
        return;
      }
      const { from, to } = editor.state.selection;
      onUpdate({
        document: editor.getJSON() as TipTapNode,
        cursorFrom: from,
        cursorTo: to,
        scrollTop: root.scrollTop,
        composing: false,
      });
    };
    root.addEventListener("compositionstart", onCompositionStart);
    root.addEventListener("compositionend", onCompositionEnd);
    return () => {
      root.removeEventListener("compositionstart", onCompositionStart);
      root.removeEventListener("compositionend", onCompositionEnd);
    };
  }, [editor, onComposingChange, onUpdate]);

  if (!editor) {
    return <div className="editor-scroll" />;
  }

  return (
    <div className="editor-pane">
      <div className="editor-toolbar">
        <button
          type="button"
          className={editor.isActive("bold") ? "active" : ""}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          粗体
        </button>
        <button
          type="button"
          className={editor.isActive("italic") ? "active" : ""}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          斜体
        </button>
        <button
          type="button"
          className={editor.isActive("strike") ? "active" : ""}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        >
          删除线
        </button>
        <button type="button" onClick={() => editor.chain().focus().setHorizontalRule().run()}>
          分隔线
        </button>
        <button
          type="button"
          onClick={async () => {
            const text = await navigator.clipboard.readText();
            editor.chain().focus().insertContent(text.replace(/\r\n/g, "\n")).run();
          }}
        >
          粘贴为纯文本
        </button>
      </div>
      <div className="editor-scroll" ref={scrollRef}>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
