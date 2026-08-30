import { getCurrentWindow } from "@tauri-apps/api/window";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isTauri } from "../api/tauri";
import type { AppApi, ChapterBody, OpenedWork } from "../api/types";
import { createAutosaveSession, type SaveStatus } from "../domain/autosave";
import {
  canCreateChapterAtRoot,
  displayChapterTitle,
  displayVolumeTitle,
  type ChapterStatus,
  type Outline,
} from "../domain/outline";
import type { SettingCatalog } from "../domain/setting";
import { countDocumentWords, type TipTapNode } from "../domain/wordCount";
import { ChapterEditor } from "../editor/ChapterEditor";
import { CommandPalette } from "./CommandPalette";
import { SettingPanel, type PanelFocus } from "./SettingPanel";

type Props = {
  api: AppApi;
  initial: OpenedWork;
  onBackToLibrary: () => void;
};

const STATUSES: ChapterStatus[] = ["初稿", "修订中", "定稿"];

export function WritingScreen({ api, initial, onBackToLibrary }: Props) {
  const [workName, setWorkName] = useState(initial.work.name);
  const [outline, setOutline] = useState<Outline>(initial.outline);
  const [chapter, setChapter] = useState<ChapterBody | null>(initial.chapter);
  const [draft, setDraft] = useState<TipTapNode | null>(initial.chapter?.body ?? null);
  const [title, setTitle] = useState(initial.chapter?.title ?? "");
  const [status, setStatus] = useState<ChapterStatus>(initial.chapter?.status ?? "初稿");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("已保存");
  const [chapterWords, setChapterWords] = useState(initial.chapter?.wordCount ?? 0);
  const [workWords, setWorkWords] = useState(initial.workWordCount);
  const [composing, setComposing] = useState(false);
  const [treeCollapsed, setTreeCollapsed] = useState(false);
  const [selectedVolumeId, setSelectedVolumeId] = useState<string | null>(
    initial.chapter?.id
      ? initial.outline.chapters.find((item) => item.id === initial.chapter?.id)?.volumeId ?? null
      : null,
  );
  const [selectedKind, setSelectedKind] = useState<"chapter" | "volume">("chapter");
  const [savedChapterWords, setSavedChapterWords] = useState(initial.chapter?.wordCount ?? 0);
  const [exitBlock, setExitBlock] = useState<null | "library" | "window">(null);
  const [lastPersistedAt, setLastPersistedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<SettingCatalog>(initial.catalog);
  const [panelFocus, setPanelFocus] = useState<PanelFocus | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [commandOpen, setCommandOpen] = useState(false);
  const [restoreNote, setRestoreNote] = useState<string | null>(null);
  const closingRef = useRef(false);

  const draftRef = useRef(draft);
  const titleRef = useRef(title);
  const chapterRef = useRef(chapter);
  const cursorRef = useRef({
    from: initial.chapter?.cursorFrom ?? 1,
    to: initial.chapter?.cursorTo ?? 1,
    scrollTop: initial.chapter?.scrollTop ?? 0,
  });
  draftRef.current = draft;
  titleRef.current = title;
  chapterRef.current = chapter;

  const persist = useCallback(async () => {
    const current = chapterRef.current;
    const body = draftRef.current;
    if (!current || !body) {
      throw new Error("没有可保存的章节");
    }
    const result = await api.saveChapter({
      id: current.id,
      title: titleRef.current,
      body,
      cursorFrom: cursorRef.current.from,
      cursorTo: cursorRef.current.to,
      scrollTop: cursorRef.current.scrollTop,
    });
    setChapterWords(result.wordCount);
    setSavedChapterWords(result.wordCount);
    setWorkWords(result.workWordCount);
    setLastPersistedAt(new Date().toLocaleTimeString());
    setOutline((prev) => ({
      ...prev,
      chapters: prev.chapters.map((item) =>
        item.id === current.id ? { ...item, title: titleRef.current } : item,
      ),
    }));
  }, [api]);

  const persistRef = useRef(persist);
  persistRef.current = persist;
  const autosave = useMemo(
    () => createAutosaveSession(() => persistRef.current(), 3000),
    [],
  );

  useEffect(() => {
    const timer = window.setInterval(() => {
      setSaveStatus(autosave.getStatus());
    }, 200);
    return () => {
      window.clearInterval(timer);
      autosave.dispose();
    };
  }, [autosave]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void autosave.saveNow();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen((value) => !value);
      }
    };
    window.addEventListener("keydown", onKey);
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (autosave.hasUnpersistedChanges()) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [autosave]);

  useEffect(() => {
    if (!isTauri()) {
      return;
    }
    const current = getCurrentWindow();
    const unlisten = current.onCloseRequested(async (event) => {
      if (closingRef.current) {
        return;
      }
      if (autosave.hasUnpersistedChanges()) {
        event.preventDefault();
        setExitBlock("window");
        return;
      }
      event.preventDefault();
      try {
        await api.closeWork();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        return;
      }
      closingRef.current = true;
      await current.destroy();
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, [api, autosave]);

  const requestLeave = (kind: "library" | "window") => {
    if (autosave.hasUnpersistedChanges()) {
      setExitBlock(kind);
      return;
    }
    if (kind === "library") {
      void api.closeWork().then(onBackToLibrary);
    }
  };

  const openChapter = async (id: string, nextOutline = outline) => {
    const next = await api.loadChapter(id);
    setChapter(next);
    setDraft(next.body);
    setTitle(next.title);
    setStatus(next.status);
    setChapterWords(next.wordCount);
    setSavedChapterWords(next.wordCount);
    setSelectedKind("chapter");
    setComposing(false);
    cursorRef.current = {
      from: next.cursorFrom,
      to: next.cursorTo,
      scrollTop: next.scrollTop,
    };
    setSelectedVolumeId(nextOutline.chapters.find((item) => item.id === id)?.volumeId ?? null);
  };

  const switchChapter = async (id: string, highlightQuery: string | null = null) => {
    if (autosave.hasUnpersistedChanges()) {
      await autosave.saveNow();
      if (autosave.hasUnpersistedChanges()) {
        setExitBlock("library");
        return;
      }
    }
    setHighlight(highlightQuery);
    await openChapter(id);
  };

  const afterDeleteChapter = async (next: Outline, removedId: string) => {
    setOutline(next);
    if (chapter?.id !== removedId) {
      return;
    }
    const fallback = next.chapters[0];
    if (fallback) {
      await openChapter(fallback.id, next);
    } else {
      setChapter(null);
      setDraft(null);
    }
  };

  return (
    <div className="writing-screen">
      <header className="writing-top">
        <button
          type="button"
          onClick={() => requestLeave("library")}
        >
          回作品库
        </button>
        <strong>{workName}</strong>
        <button
          type="button"
          onClick={() => {
            const next = window.prompt("作品名称", workName);
            if (next && next !== workName) {
              void api.renameWork(initial.work.id, next).then(() => setWorkName(next));
            }
          }}
        >
          改名
        </button>
        <button
          type="button"
          onClick={() => {
            void (async () => {
              try {
                await autosave.saveNow();
                if (autosave.hasUnpersistedChanges()) {
                  setExitBlock("library");
                  return;
                }
                const point = await api.createRestorePoint();
                setRestoreNote(`已创建恢复点 ${point.folderName}`);
                setError(null);
              } catch (err) {
                setError(err instanceof Error ? err.message : String(err));
              }
            })();
          }}
        >
          创建恢复点
        </button>
        {initial.fts5 ? null : <span className="error">FTS5 不可用</span>}
      </header>
      <div className="writing-body">
        <aside className={treeCollapsed ? "outline-tree collapsed" : "outline-tree"}>
          <div className="tree-head">
            <button type="button" onClick={() => setTreeCollapsed((value) => !value)}>
              {treeCollapsed ? "展开卷章" : "折叠"}
            </button>
            {!treeCollapsed ? (
              <>
                <button
                  type="button"
                  onClick={async () => {
                    await autosave.saveNow();
                    if (autosave.hasUnpersistedChanges()) {
                      setExitBlock("library");
                      return;
                    }
                    const created = await api.createChapter({
                      afterChapterId: selectedKind === "chapter" ? chapter?.id ?? null : null,
                      selectedVolumeId,
                    });
                    setOutline(created.outline);
                    setChapter(created.chapter);
                    setDraft(created.chapter.body);
                    setTitle(created.chapter.title);
                    setStatus(created.chapter.status);
                    setSelectedKind("chapter");
                    setHighlight(null);
                  }}
                >
                  新章节
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await autosave.saveNow();
                    if (autosave.hasUnpersistedChanges()) {
                      setExitBlock("library");
                      return;
                    }
                    const next = await api.createVolume("未命名卷");
                    setOutline(next);
                    setSelectedVolumeId(next.volumes[next.volumes.length - 1]?.id ?? null);
                    setSelectedKind("volume");
                  }}
                >
                  新卷
                </button>
                {canCreateChapterAtRoot(outline) ? null : (
                  <button
                    type="button"
                    onClick={async () => {
                      await autosave.saveNow();
                      if (autosave.hasUnpersistedChanges()) {
                        setExitBlock("library");
                        return;
                      }
                      setOutline(await api.cancelVolumes());
                      setSelectedVolumeId(null);
                      setSelectedKind("chapter");
                    }}
                  >
                    取消卷
                  </button>
                )}
              </>
            ) : null}
          </div>
          {!treeCollapsed ? (
            <div className="tree-list">
              {outline.volumes.map((volume) => (
                <div key={volume.id} className="volume-block">
                  <div
                    className={
                      selectedKind === "volume" && selectedVolumeId === volume.id
                        ? "tree-item selected"
                        : "tree-item"
                    }
                    onClick={() => {
                      setSelectedVolumeId(volume.id);
                      setSelectedKind("volume");
                    }}
                  >
                    <input
                      value={volume.title}
                      placeholder="未命名卷"
                      onChange={(event) => {
                        const nextTitle = event.target.value;
                        setOutline((prev) => ({
                          ...prev,
                          volumes: prev.volumes.map((item) =>
                            item.id === volume.id ? { ...item, title: nextTitle } : item,
                          ),
                        }));
                      }}
                      onBlur={() => void api.renameVolume(volume.id, volume.title)}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm(`删除「${displayVolumeTitle(volume.title)}」及其章节？`)) {
                          void api.deleteVolume(volume.id).then(async (next) => {
                            setSelectedVolumeId(null);
                            if (chapter && !next.chapters.some((item) => item.id === chapter.id)) {
                              await afterDeleteChapter(next, chapter.id);
                            } else {
                              setOutline(next);
                            }
                          });
                        }
                      }}
                    >
                      删
                    </button>
                  </div>
                  {outline.chapters
                    .filter((item) => item.volumeId === volume.id)
                    .sort((a, b) => a.sortOrder - b.sortOrder)
                    .map((item) => (
                      <ChapterRow
                        key={item.id}
                        title={item.title}
                        active={chapter?.id === item.id}
                        onOpen={() => void switchChapter(item.id)}
                        onDelete={() =>
                          void api.deleteChapter(item.id).then((next) => afterDeleteChapter(next, item.id))
                        }
                        onMove={(direction) => void api.moveChapter(item.id, direction).then(setOutline)}
                      />
                    ))}
                </div>
              ))}
              {outline.volumes.length === 0
                ? outline.chapters
                    .slice()
                    .sort((a, b) => a.sortOrder - b.sortOrder)
                    .map((item) => (
                      <ChapterRow
                        key={item.id}
                        title={item.title}
                        active={chapter?.id === item.id}
                        onOpen={() => void switchChapter(item.id)}
                        onDelete={() =>
                          void api.deleteChapter(item.id).then((next) => afterDeleteChapter(next, item.id))
                        }
                        onMove={(direction) => void api.moveChapter(item.id, direction).then(setOutline)}
                      />
                    ))
                : null}
            </div>
          ) : null}
        </aside>
        <section className="editor-column">
          {chapter && draft ? (
            <>
              <div className="chapter-meta">
                <input
                  className="chapter-title"
                  value={title}
                  placeholder="未命名章节"
                  onChange={(event) => {
                    const nextTitle = event.target.value;
                    titleRef.current = nextTitle;
                    setTitle(nextTitle);
                    setOutline((prev) => ({
                      ...prev,
                      chapters: prev.chapters.map((item) =>
                        item.id === chapter.id ? { ...item, title: nextTitle } : item,
                      ),
                    }));
                    autosave.notifyChange(false);
                  }}
                />
                <select
                  value={status}
                  onChange={(event) => {
                    const next = event.target.value as ChapterStatus;
                    setStatus(next);
                    void api.setChapterStatus(chapter.id, next);
                  }}
                >
                  {STATUSES.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </div>
              <ChapterEditor
                chapterId={chapter.id}
                document={draft}
                cursorFrom={chapter.cursorFrom}
                cursorTo={chapter.cursorTo}
                scrollTop={chapter.scrollTop}
                highlightQuery={highlight}
                composing={composing}
                onComposingChange={setComposing}
                onUpdate={(payload) => {
                  draftRef.current = payload.document;
                  cursorRef.current = {
                    from: payload.cursorFrom,
                    to: payload.cursorTo,
                    scrollTop: payload.scrollTop,
                  };
                  setDraft(payload.document);
                  setChapterWords(countDocumentWords(payload.document));
                  autosave.notifyChange(payload.composing);
                }}
              />
            </>
          ) : (
            <div className="empty-chapter">这部作品暂时没有章节。不会自动补建「第一章」。</div>
          )}
        </section>
        <SettingPanel
          api={api}
          catalog={catalog}
          outline={outline}
          chapterId={chapter?.id ?? null}
          focus={panelFocus}
          onCatalogChange={setCatalog}
          onOutlineChange={setOutline}
          onOpenChapter={(id) => void switchChapter(id)}
        />
      </div>
      <footer className="status-bar">
        <span>本章 {chapterWords} 字</span>
        <span>作品 {workWords - savedChapterWords + chapterWords} 字</span>
        <span className={saveStatus === "保存失败" ? "error" : ""}>{saveStatus}</span>
        <span className={composing ? "composing" : "muted"}>
          {composing ? "组字中，不落盘" : "组字结束才自动保存"}
        </span>
        {lastPersistedAt ? <span className="muted">上次落盘 {lastPersistedAt}</span> : null}
        {restoreNote ? <span className="muted">{restoreNote}</span> : null}
        {import.meta.env.DEV ? (
          <button
            type="button"
            onClick={() => {
              void api.failNextSave();
              setError("已安排下次保存失败");
            }}
          >
            模拟保存失败
          </button>
        ) : null}
        {error ? <span className="error">{error}</span> : null}
      </footer>
      {commandOpen ? (
        <CommandPalette
          api={api}
          onClose={() => setCommandOpen(false)}
          onPickChapter={async (hit) => {
            setCommandOpen(false);
            await switchChapter(hit.id, hit.query);
          }}
          onPickSetting={(hit) => {
            setCommandOpen(false);
            setPanelFocus({
              tab: hit.kind === "storyline" ? "storyline" : hit.kind,
              id: hit.id,
              token: Date.now(),
            });
          }}
        />
      ) : null}
      {exitBlock ? (
        <div className="modal">
          <div className="dialog">
            <p>还有未落盘的内容，不能静默离开。</p>
            <div className="row">
              <button
                type="button"
                className="primary"
                onClick={async () => {
                  await autosave.retry();
                  if (!autosave.hasUnpersistedChanges()) {
                    const kind = exitBlock;
                    setExitBlock(null);
                    if (kind === "library") {
                      await api.closeWork();
                      onBackToLibrary();
                    } else if (kind === "window" && isTauri()) {
                      await api.closeWork();
                      closingRef.current = true;
                      await getCurrentWindow().destroy();
                    }
                  }
                }}
              >
                重试保存
              </button>
              <button type="button" onClick={() => setExitBlock(null)}>
                取消
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ChapterRow({
  title,
  active,
  onOpen,
  onDelete,
  onMove,
}: {
  title: string;
  active: boolean;
  onOpen: () => void;
  onDelete: () => void;
  onMove: (direction: "up" | "down") => void;
}) {
  return (
    <div className={active ? "tree-item chapter selected" : "tree-item chapter"}>
      <button type="button" className="tree-open" onClick={onOpen}>
        {displayChapterTitle(title)}
      </button>
      <button type="button" onClick={() => onMove("up")}>
        上
      </button>
      <button type="button" onClick={() => onMove("down")}>
        下
      </button>
      <button type="button" onClick={onDelete}>
        删
      </button>
    </div>
  );
}
