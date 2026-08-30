import { useEffect, useMemo, useState } from "react";
import { createMemoryApi } from "./api/memory";
import { createTauriApi, isTauri } from "./api/tauri";
import type { AppApi, OpenedWork } from "./api/types";
import { LibraryScreen } from "./screens/LibraryScreen";
import { SetupScreen } from "./screens/SetupScreen";
import { WritingScreen } from "./screens/WritingScreen";
import "./App.css";

type Screen =
  | { kind: "loading" }
  | { kind: "setup"; defaultLibraryPath: string }
  | { kind: "library"; libraryPath: string }
  | { kind: "writing"; libraryPath: string; opened: OpenedWork };

export default function App() {
  const api = useMemo<AppApi>(() => (isTauri() ? createTauriApi() : createMemoryApi()), []);
  const [screen, setScreen] = useState<Screen>({ kind: "loading" });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api
      .getBootstrap()
      .then((boot) => {
        if (boot.libraryPath) {
          setScreen({ kind: "library", libraryPath: boot.libraryPath });
        } else {
          setScreen({ kind: "setup", defaultLibraryPath: boot.defaultLibraryPath });
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, [api]);

  if (error) {
    return <main className="setup-screen"><p className="error">{error}</p></main>;
  }

  if (screen.kind === "loading") {
    return <main className="setup-screen">正在打开作品库…</main>;
  }

  if (screen.kind === "setup") {
    return (
      <SetupScreen
        api={api}
        defaultLibraryPath={screen.defaultLibraryPath}
        onReady={(nextPath) => setScreen({ kind: "library", libraryPath: nextPath })}
      />
    );
  }

  if (screen.kind === "library") {
    return (
      <LibraryScreen
        api={api}
        libraryPath={screen.libraryPath}
        onLibraryPathChange={(path) => setScreen({ kind: "library", libraryPath: path })}
        onOpenWork={async (id) => {
          const opened = await api.openWork(id);
          setScreen({ kind: "writing", libraryPath: screen.libraryPath, opened });
        }}
      />
    );
  }

  return (
    <WritingScreen
      api={api}
      initial={screen.opened}
      onBackToLibrary={() => setScreen({ kind: "library", libraryPath: screen.libraryPath })}
    />
  );
}
