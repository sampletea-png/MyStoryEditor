import { useEffect, useState } from "react";
import type { AppApi, WorkSummary } from "../api/types";

type Props = {
  api: AppApi;
  libraryPath: string;
  onOpenWork: (openedId: string) => Promise<void>;
  onLibraryPathChange: (path: string) => void;
};

export function LibraryScreen({ api, libraryPath, onOpenWork, onLibraryPathChange }: Props) {
  const [works, setWorks] = useState<WorkSummary[]>([]);
  const [recycled, setRecycled] = useState<WorkSummary[]>([]);
  const [name, setName] = useState("");
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = async () => {
    const [nextWorks, nextRecycled] = await Promise.all([
      api.listWorks(),
      api.listRecycledWorks(),
    ]);
    setWorks(nextWorks);
    setRecycled(nextRecycled);
  };

  useEffect(() => {
    void reload().catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, [api]);

  return (
    <main className="library-screen">
      <header>
        <h1>作品库</h1>
        <p className="muted">{libraryPath}</p>
        <button
          type="button"
          onClick={async () => {
            const selected = await api.pickDirectory(libraryPath);
            if (selected && selected !== libraryPath) {
              await api.setLibraryPath(selected);
              onLibraryPathChange(selected);
              await reload();
            }
          }}
        >
          更改作品库位置
        </button>
      </header>
      <form
        className="create-work"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!name.trim()) {
            setError("新建作品时名称必填");
            return;
          }
          setBusy(true);
          setError(null);
          try {
            const opened = await api.createWork(name.trim());
            await onOpenWork(opened.work.id);
          } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="新作品名称"
          required
        />
        <button type="submit" className="primary" disabled={busy}>
          新建作品
        </button>
      </form>
      {error ? <p className="error">{error}</p> : null}
      <section>
        <h2>作品</h2>
        {works.length === 0 ? <p className="muted">还没有作品。</p> : null}
        <ul className="work-list">
          {works.map((work) => (
            <li key={work.id}>
              {renameId === work.id ? (
                <form
                  onSubmit={async (event) => {
                    event.preventDefault();
                    await api.renameWork(work.id, renameValue);
                    setRenameId(null);
                    await reload();
                  }}
                >
                  <input
                    value={renameValue}
                    onChange={(event) => setRenameValue(event.target.value)}
                  />
                  <button type="submit">保存名称</button>
                </form>
              ) : (
                <>
                  <button
                    type="button"
                    className="work-open"
                    onClick={() =>
                      void onOpenWork(work.id).catch((err) =>
                        setError(err instanceof Error ? err.message : String(err)),
                      )
                    }
                  >
                    <strong>{work.name}</strong>
                    <span className="muted">{work.folderName}</span>
                    {work.problem ? <span className="error">{work.problem}</span> : null}
                  </button>
                  {work.problem ? null : (
                    <button
                      type="button"
                      onClick={() => {
                        setRenameId(work.id);
                        setRenameValue(work.name);
                      }}
                    >
                      改名
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={async () => {
                      await api.deleteWork(work.id);
                      await reload();
                    }}
                  >
                    删除
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2>作品库回收区</h2>
        {recycled.length === 0 ? <p className="muted">回收区是空的。</p> : null}
        <ul className="work-list">
          {recycled.map((work) => (
            <li key={work.id}>
              <div>
                <strong>{work.name}</strong>
                <span className="muted">{work.folderName}</span>
                {work.problem ? <span className="error">{work.problem}</span> : null}
              </div>
              <button
                type="button"
                onClick={async () => {
                  await api.restoreWork(work.id);
                  await reload();
                }}
              >
                恢复
              </button>
              <button
                type="button"
                onClick={async () => {
                  const confirmed = window.confirm(
                    `永久删除「${work.name}」及其旁路恢复点。此操作不可撤销。`,
                  );
                  if (!confirmed) {
                    return;
                  }
                  await api.permanentlyDeleteWork(work.id);
                  await reload();
                }}
              >
                永久删除
              </button>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
