import { describe, expect, test } from "bun:test";

import { createScanRuntime, type ScanSnapshotEmitter } from "./runtime";
import {
  initialScanProgress,
  type ScanLifecycleSnapshot,
  type ScanLifecycleState,
  type ScanProgress,
} from "./schema";

describe("scan runtime", () => {
  test("resolves defaults and emits starting snapshots before adapter work", () => {
    const snapshots: ScanLifecycleSnapshot[] = [];
    let observedRequest: unknown = null;

    const runtime = createScanRuntime({
      defaultPath: "/Users/erik",
      defaultExcludedPaths: ["/Users/erik/Library/CloudStorage"],
      onSnapshot(snapshot) {
        snapshots.push(snapshot);
      },
      adapter: {
        start(request) {
          observedRequest = request;
          return { cancel() {} };
        },
      },
    });

    const request = runtime.start();

    expect(request).toEqual({
      path: "/Users/erik",
      excludedPaths: ["/Users/erik/Library/CloudStorage"],
      deepScanGenerated: false,
    });
    expect(observedRequest).toEqual(request);
    expect(snapshots[0]).toMatchObject({
      state: "starting",
      progress: { currentPath: "/Users/erik" },
    });
    expect(runtime.canCancel()).toBe(true);
  });

  test("cancels active work and suppresses stale snapshots", () => {
    let emitSnapshot: ScanSnapshotEmitter | null = null;
    let cancelCount = 0;
    const runtime = createScanRuntime({
      defaultPath: "/tmp/zpace",
      adapter: {
        start(_request, emit) {
          emitSnapshot = emit;
          emit(createSnapshot("running", { ...initialScanProgress, currentPath: "/tmp/zpace" }));
          return {
            cancel() {
              cancelCount += 1;
            },
          };
        },
      },
    });

    runtime.start();
    expect(runtime.snapshot.state).toBe("running");

    expect(runtime.cancel()).toBe(true);
    expect(cancelCount).toBe(1);
    expect(runtime.snapshot.state).toBe("cancelled");
    expect(runtime.snapshot.progress.currentPath).toBeNull();

    expectEmitter(emitSnapshot)(
      createSnapshot("complete", { ...initialScanProgress, currentPath: null }),
    );
    expect(runtime.snapshot.state).toBe("cancelled");
  });

  test("converts adapter start failures to error snapshots", () => {
    const runtime = createScanRuntime({
      defaultPath: "/tmp/zpace",
      adapter: {
        start() {
          throw new Error("bad adapter");
        },
      },
    });

    runtime.start();

    expect(runtime.snapshot.state).toBe("error");
    expect(runtime.snapshot.error).toBe("bad adapter");
    expect(runtime.canRescan()).toBe(true);
  });
});

function createSnapshot(
  state: ScanLifecycleState,
  progress: ScanProgress,
): ScanLifecycleSnapshot {
  return {
    state,
    progress,
    result: null,
    error: null,
  };
}

function expectEmitter(emitSnapshot: ScanSnapshotEmitter | null): ScanSnapshotEmitter {
  expect(emitSnapshot).not.toBeNull();
  return emitSnapshot as ScanSnapshotEmitter;
}
