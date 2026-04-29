import { describe, expect, test } from "bun:test";

import {
  applyLifecycleEvent,
  cancelScan,
  completeScan,
  createInitialScanLifecycleSnapshot,
  failScan,
  isActiveScanState,
} from "./lifecycle";
import type { ScanResult } from "./schema";

describe("scan lifecycle state", () => {
  test("transitions through started, progress, and completed", () => {
    const state = createInitialScanLifecycleSnapshot();

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
    const state = createInitialScanLifecycleSnapshot();
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

  test("cancels active scans without changing terminal snapshots", () => {
    const state = createInitialScanLifecycleSnapshot();
    state.progress.currentPath = "/tmp/zpace";

    cancelScan(state);

    expect(state.state).toBe("cancelled");
    expect(state.progress.currentPath).toBeNull();
    expect(isActiveScanState(state.state)).toBe(false);

    cancelScan(state);
    expect(state.state).toBe("cancelled");
  });

  test("records terminal result and error states", () => {
    const state = createInitialScanLifecycleSnapshot();
    const result = scanResult();

    completeScan(state, result);
    expect(state.state).toBe("complete");
    expect(state.result).toBe(result);
    expect(state.error).toBeNull();

    failScan(state, new Error("bad scanner output"));
    expect(state.state).toBe("error");
    expect(state.error).toBe("bad scanner output");
  });
});

function scanResult(): ScanResult {
  return {
    schemaVersion: 1,
    root: {
      path: "/tmp/zpace",
      name: "zpace",
      type: "directory",
      logicalSize: 0,
      allocatedSize: null,
      childCount: 0,
      status: "complete",
      classification: null,
      children: [],
    },
    summary: {
      totalLogicalSize: 0,
      totalAllocatedSize: null,
      likelyReclaimableSize: 0,
      fileCount: 0,
      folderCount: 1,
      warningCount: 0,
      inaccessibleCount: 0,
      skippedCount: 0,
      protectedCount: 0,
      freeSize: null,
      purgeableSize: null,
      durationMs: 0,
      largestItems: [],
      categories: [],
    },
    diagnostics: [],
  };
}
