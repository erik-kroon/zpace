import { describe, expect, test } from "bun:test";

import { applyLifecycleEvent } from "./run";
import { initialScanProgress, type ScanLifecycleSnapshot } from "./schema";

function snapshot(): ScanLifecycleSnapshot {
  return {
    state: "starting",
    progress: { ...initialScanProgress },
    result: null,
    error: null,
  };
}

describe("scan lifecycle state", () => {
  test("transitions through started, progress, and completed", () => {
    const state = snapshot();

    applyLifecycleEvent(state, { type: "started", path: "/tmp/zpace" });
    expect(state.state).toBe("running");
    expect(state.progress.currentPath).toBe("/tmp/zpace");

    applyLifecycleEvent(state, {
      type: "progress",
      progress: {
        pathsScanned: 2,
        directoriesScanned: 1,
        filesScanned: 1,
        currentPath: "/tmp/zpace/package.json",
      },
    });
    expect(state.progress.filesScanned).toBe(1);

    applyLifecycleEvent(state, {
      type: "completed",
      progress: {
        pathsScanned: 2,
        directoriesScanned: 1,
        filesScanned: 1,
        currentPath: null,
      },
    });
    expect(state.state).toBe("complete");
    expect(state.progress.currentPath).toBeNull();
  });

  test("ignores late progress after cancellation", () => {
    const state = snapshot();
    state.state = "cancelled";

    applyLifecycleEvent(state, {
      type: "progress",
      progress: {
        pathsScanned: 99,
        directoriesScanned: 9,
        filesScanned: 90,
        currentPath: "/late",
      },
    });

    expect(state.progress.pathsScanned).toBe(0);
    expect(state.state).toBe("cancelled");
  });
});
