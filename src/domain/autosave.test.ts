import { describe, expect, it, vi } from "vitest";
import { createAutosaveController } from "./autosave";

describe("createAutosaveController", () => {
  it("does not persist while IME composition is in progress", async () => {
    vi.useFakeTimers();
    const persist = vi.fn().mockResolvedValue(undefined);
    const controller = createAutosaveController(persist, 3000);

    controller.notifyChange(true);
    await vi.advanceTimersByTimeAsync(3000);
    expect(persist).not.toHaveBeenCalled();
    expect(controller.hasUnpersistedChanges()).toBe(true);

    controller.notifyChange(false);
    await vi.advanceTimersByTimeAsync(3000);
    expect(persist).toHaveBeenCalledTimes(1);
    expect(controller.getStatus()).toBe("已保存");

    controller.dispose();
    vi.useRealTimers();
  });

  it("keeps memory dirty and reports 保存失败 when persist rejects", async () => {
    const persist = vi.fn().mockRejectedValue(new Error("disk full"));
    const controller = createAutosaveController(persist, 0);

    controller.notifyChange(false);
    await vi.waitFor(() => {
      expect(controller.getStatus()).toBe("保存失败");
    });
    expect(controller.hasUnpersistedChanges()).toBe(true);

    controller.dispose();
  });
});
