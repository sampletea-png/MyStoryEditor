import { useEffect, useState } from "react";
import type { AppApi, ChapterHit, SettingHit } from "../api/types";
import { displayChapterTitle } from "../domain/outline";
import { displaySettingName, type SettingKind } from "../domain/settingNames";

type Props = {
  api: AppApi;
  onClose: () => void;
  onPickChapter: (hit: ChapterHit) => void;
  onPickSetting: (hit: SettingHit) => void;
};

export function CommandPalette({ api, onClose, onPickChapter, onPickSetting }: Props) {
  const [query, setQuery] = useState("");
  const [chapters, setChapters] = useState<ChapterHit[]>([]);
  const [settings, setSettings] = useState<SettingHit[]>([]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      void api.searchWork(query).then((result) => {
        setChapters(result.chapters);
        setSettings(result.settings);
      });
    }, 80);
    return () => window.clearTimeout(handle);
  }, [api, query]);

  return (
    <div className="modal" onClick={onClose}>
      <div className="dialog command-palette" onClick={(event) => event.stopPropagation()}>
        <input
          autoFocus
          value={query}
          placeholder="跳到章节或打开设定"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              onClose();
            }
          }}
        />
        <section>
          <h3>章节</h3>
          {chapters.length === 0 ? <p className="muted">没有章节命中</p> : null}
          {chapters.map((item) => (
            <button
              key={item.id}
              type="button"
              className="tree-open"
              onClick={() => onPickChapter(item)}
            >
              {displayChapterTitle(item.title)}
              <span className="muted">{item.snippet}</span>
            </button>
          ))}
        </section>
        <section>
          <h3>设定</h3>
          {settings.length === 0 ? <p className="muted">没有设定命中</p> : null}
          {settings.map((item) => (
            <button
              key={`${item.kind}-${item.id}`}
              type="button"
              className="tree-open"
              onClick={() => onPickSetting(item)}
            >
              {settingKindLabel(item.kind)} · {displaySettingName(toSettingKind(item.kind), item.name)}
              {item.snippet ? <span className="muted">{item.snippet}</span> : null}
            </button>
          ))}
        </section>
      </div>
    </div>
  );
}

function settingKindLabel(kind: SettingHit["kind"]): string {
  switch (kind) {
    case "character":
      return "角色";
    case "location":
      return "地点";
    case "event":
      return "事件";
    case "storyline":
      return "故事线";
    case "setting":
      return "设定条目";
  }
}

function toSettingKind(kind: SettingHit["kind"]): SettingKind {
  return kind === "storyline" ? "storyline" : kind;
}
