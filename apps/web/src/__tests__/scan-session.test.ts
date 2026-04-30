import { afterEach, describe, expect, test, vi } from "vitest";

import {
  createFixtureScanSession,
  createScanSession,
  type ScanSessionAdapter,
  type ScanSnapshotEmitter,
} from "@/scan-session";
import {
  initialScanProgress,
  type ScanLifecycleSnapshot,
  type ScanLifecycleState,
  type ScanProgress,
  type ScanResult,
} from "@zpace/scanner/src/schema";

afterEach(() => {
  vi.useRealTimers();
});

const idleSnapshot: ScanLifecycleSnapshot = {
  state: "idle",
  progress: { ...initialScanProgress },
  result: null,
  error: null,
};

describe("createFixtureScanSession", () => {
  test("cancels an active scan", () => {
    vi.useFakeTimers();
    const session = createFixtureScanSession();

    session.startRescan();
    expect(session.canCancel()).toBe(true);

    session.cancel();
    expect(session.snapshot().state).toBe("cancelled");
    expect(session.snapshot().progress.currentPath).toBeNull();
    expect(session.canRescan()).toBe(true);
  });

  test("supports re-scan after a completed scan", () => {
    vi.useFakeTimers();
    const session = createFixtureScanSession();

    expect(session.snapshot().state).toBe("complete");
    session.startRescan();
    expect(session.snapshot().state).toBe("running");

    vi.advanceTimersByTime(900);
    expect(session.snapshot().state).toBe("complete");
    expect(session.snapshot().result?.root.name).toBe("erik");
  });
});

describe("createScanSession", () => {
  test("uses adapter snapshots without exposing adapter details to callers", () => {
    let emitSnapshot: ScanSnapshotEmitter | null = null;
    const adapter: ScanSessionAdapter = {
      initialSnapshot: idleSnapshot,
      start(_request, emit) {
        emitSnapshot = emit;
        emit(createSnapshot("running", { ...initialScanProgress, currentPath: "/tmp/zpace" }));
        return { cancel: vi.fn() };
      },
    };
    const session = createScanSession(adapter);

    expect(session.snapshot().state).toBe("idle");
    session.startRescan();

    expect(session.snapshot().state).toBe("running");
    expect(session.snapshot().progress.currentPath).toBe("/tmp/zpace");
    expect(session.canCancel()).toBe(true);

    expectEmitter(emitSnapshot)(
      createSnapshot("complete", { ...initialScanProgress, currentPath: null }),
    );

    expect(session.snapshot().state).toBe("complete");
    expect(session.canRescan()).toBe(true);
  });

  test("ignores adapter snapshots from a cancelled run", () => {
    let emitSnapshot: ScanSnapshotEmitter | null = null;
    const cancel = vi.fn();
    const adapter: ScanSessionAdapter = {
      initialSnapshot: idleSnapshot,
      start(_request, emit) {
        emitSnapshot = emit;
        emit(createSnapshot("running", { ...initialScanProgress, currentPath: "/tmp/zpace" }));
        return { cancel };
      },
    };
    const session = createScanSession(adapter);

    session.startRescan();
    session.cancel();
    expectEmitter(emitSnapshot)(
      createSnapshot("complete", { ...initialScanProgress, currentPath: null }),
    );

    expect(cancel).toHaveBeenCalledTimes(1);
    expect(session.snapshot().state).toBe("cancelled");
    expect(session.snapshot().progress.currentPath).toBeNull();
  });
});

function createSnapshot(
  state: ScanLifecycleState,
  progress: ScanProgress,
  result: ScanResult | null = null,
): ScanLifecycleSnapshot {
  return {
    state,
    progress,
    result,
    error: null,
  };
}

function expectEmitter(emitSnapshot: ScanSnapshotEmitter | null): ScanSnapshotEmitter {
  expect(emitSnapshot).not.toBeNull();
  return emitSnapshot as ScanSnapshotEmitter;
}
