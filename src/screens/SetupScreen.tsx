import { useState } from "react";
import type { AppApi } from "../api/types";

type Props = {
  api: AppApi;
  defaultLibraryPath: string;
  onReady: (libraryPath: string) => void;
};

export function SetupScreen({ api, defaultLibraryPath, onReady }: Props) {
  const [path, setPath] = useState(defaultLibraryPath);
  const [error, setError] = useState<string | null>(null);

  return (
    <main className="setup-screen">
      <h1>小说编辑器</h1>
      <p>请确认作品库位置。之后打开应用会进入这部作品库的列表，而不是直接进入某部作品。</p>
      <label>
        作品库位置
        <input value={path} onChange={(event) => setPath(event.target.value)} />
      </label>
      <div className="row">
        <button
          type="button"
          onClick={async () => {
            const selected = await api.pickDirectory(path);
            if (selected) {
              setPath(selected);
            }
          }}
        >
          浏览…
        </button>
        <button
          type="button"
          className="primary"
          onClick={async () => {
            try {
              await api.setLibraryPath(path);
              onReady(path);
            } catch (err) {
              setError(err instanceof Error ? err.message : String(err));
            }
          }}
        >
          使用此位置
        </button>
      </div>
      {error ? <p className="error">{error}</p> : null}
    </main>
  );
}
