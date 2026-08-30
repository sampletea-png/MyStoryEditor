import { EditorContent, useEditor } from "@tiptap/react";
import { useEffect, useRef } from "react";
import type { TipTapNode } from "../domain/wordCount";
import { writingExtensions } from "./extensions";

type Props = {
  fieldId: string;
  document: TipTapNode;
  onChange: (document: TipTapNode, composing: boolean) => void;
};

export function FieldEditor({ fieldId, document, onChange }: Props) {
  const skipEmit = useRef(true);
  const composingRef = useRef(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const editor = useEditor({
    extensions: writingExtensions,
    content: document,
    editorProps: {
      attributes: {
        class: "field-editor",
        spellcheck: "false",
      },
    },
    onUpdate: ({ editor: instance }) => {
      if (skipEmit.current) {
        return;
      }
      onChange(instance.getJSON() as TipTapNode, instance.view.composing || composingRef.current);
    },
  });

  useEffect(() => {
    if (!editor) {
      return;
    }
    skipEmit.current = true;
    editor.commands.setContent(document, false);
    requestAnimationFrame(() => {
      skipEmit.current = false;
    });
  }, [editor, fieldId]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) {
      return;
    }
    const onStart = () => {
      composingRef.current = true;
    };
    const onEnd = () => {
      composingRef.current = false;
      if (!editor || skipEmit.current) {
        return;
      }
      onChange(editor.getJSON() as TipTapNode, false);
    };
    root.addEventListener("compositionstart", onStart);
    root.addEventListener("compositionend", onEnd);
    return () => {
      root.removeEventListener("compositionstart", onStart);
      root.removeEventListener("compositionend", onEnd);
    };
  }, [editor, onChange]);

  if (!editor) {
    return <div className="field-editor-shell" />;
  }

  return (
    <div className="field-editor-shell" ref={rootRef}>
      <div className="editor-toolbar compact">
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
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
