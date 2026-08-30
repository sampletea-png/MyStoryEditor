export type SaveStatus = "已保存" | "保存中" | "保存失败";

export type AutosavePersist = () => Promise<void>;

export type AutosaveController = {
  notifyChange: (composing: boolean) => void;
  saveNow: () => Promise<void>;
  retry: () => Promise<void>;
  dispose: () => void;
  getStatus: () => SaveStatus;
  hasUnpersistedChanges: () => boolean;
  isDisposed: () => boolean;
};

export function createAutosaveController(
  persist: AutosavePersist,
  delayMs = 3000,
): AutosaveController {
  let status: SaveStatus = "已保存";
  let dirty = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inflight: Promise<void> | null = null;
  let disposed = false;

  const clearTimer = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const runPersist = async () => {
    if (disposed || inflight) {
      return;
    }
    if (!dirty) {
      return;
    }
    status = "保存中";
    const job = persist()
      .then(() => {
        dirty = false;
        status = "已保存";
      })
      .catch(() => {
        status = "保存失败";
        schedule();
      })
      .finally(() => {
        inflight = null;
        if (dirty && status !== "保存失败" && status !== "保存中") {
          void runPersist();
        }
      });
    inflight = job;
    await job;
  };

  const schedule = () => {
    clearTimer();
    timer = setTimeout(() => {
      timer = null;
      void runPersist();
    }, delayMs);
  };

  return {
    notifyChange(composing) {
      if (disposed) {
        return;
      }
      dirty = true;
      if (composing) {
        clearTimer();
        return;
      }
      schedule();
    },
    async saveNow() {
      if (disposed) {
        return;
      }
      clearTimer();
      dirty = true;
      await runPersist();
    },
    async retry() {
      await this.saveNow();
    },
    dispose() {
      disposed = true;
      clearTimer();
    },
    getStatus() {
      return status;
    },
    hasUnpersistedChanges() {
      return dirty || status === "保存失败" || status === "保存中";
    },
    isDisposed() {
      return disposed;
    },
  };
}

export function createAutosaveSession(
  persist: AutosavePersist,
  delayMs = 3000,
): AutosaveController {
  let inner = createAutosaveController(persist, delayMs);

  const live = () => {
    if (inner.isDisposed()) {
      inner = createAutosaveController(persist, delayMs);
    }
    return inner;
  };

  return {
    notifyChange(composing) {
      live().notifyChange(composing);
    },
    saveNow() {
      return live().saveNow();
    },
    retry() {
      return live().retry();
    },
    dispose() {
      inner.dispose();
    },
    getStatus() {
      return inner.getStatus();
    },
    hasUnpersistedChanges() {
      return inner.hasUnpersistedChanges();
    },
    isDisposed() {
      return inner.isDisposed();
    },
  };
}
