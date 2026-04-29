import { createSignal } from "solid-js";

import { fixtureScanResult } from "@/fixtures/scan-result";
import {
  cloneSnapshot,
  createScanRuntime,
  type ResolvedScanRuntimeRequest,
  type ScanRuntime,
  type ScanRuntimeRun,
  type ScanSnapshotEmitter,
} from "@zpace/scanner/src/runtime";
import {
  initialScanProgress,
  type ScanLifecycleSnapshot,
  type ScanLifecycleState,
  type ScanProgress,
  type ScanResult,
} from "@zpace/scanner/src/schema";

export interface ScanSession {
  snapshot: () => ScanLifecycleSnapshot;
  canCancel: () => boolean;
  canRescan: () => boolean;
  startRescan: (path?: string, excludedPaths?: string[], deepScanGenerated?: boolean) => void;
  cancel: () => void;
}

export interface ScanSessionAdapter {
  initialSnapshot: ScanLifecycleSnapshot;
  start: (
    request: ResolvedScanRuntimeRequest,
    emit: ScanSnapshotEmitter,
  ) => ScanRuntimeRun;
}

const completeSnapshot: ScanLifecycleSnapshot = {
  state: "complete",
  progress: {
    pathsScanned: fixtureScanResult.root.childCount + 1,
    directoriesScanned: 3,
    filesScanned: 1,
    logicalSizeScanned: fixtureScanResult.root.logicalSize,
    currentPath: null,
  },
  result: fixtureScanResult,
  error: null,
};

export function createScanSession(
  adapter: ScanSessionAdapter,
  defaults: { path?: string; excludedPaths?: string[] } = {},
): ScanSession {
  const [snapshot, setSnapshot] = createSignal<ScanLifecycleSnapshot>(
    cloneSnapshot(adapter.initialSnapshot),
  );
  const runtime: ScanRuntime = createScanRuntime({
    adapter: {
      start(request, emit) {
        return adapter.start(request, emit);
      },
    },
    initialSnapshot: adapter.initialSnapshot,
    defaultPath: defaults.path ?? "~",
    defaultExcludedPaths: defaults.excludedPaths ?? [],
    onSnapshot: setSnapshot,
  });

  const startRescan = (path?: string, excludedPaths?: string[], deepScanGenerated?: boolean) => {
    runtime.start({
      path,
      excludedPaths,
      deepScanGenerated,
    });
  };

  return {
    snapshot,
    canCancel: () => runtime.canCancel(),
    canRescan: () => runtime.canRescan(),
    startRescan,
    cancel() {
      runtime.cancel();
    },
  };
}

export function createFixtureScanSession(): ScanSession {
  return createScanSession(createFixtureScanSessionAdapter());
}

export function createFixtureScanSessionAdapter(): ScanSessionAdapter {
  return {
    initialSnapshot: completeSnapshot,
    start(_request, emit) {
      let timer: ReturnType<typeof setInterval> | null = null;

      const clearTimer = () => {
        if (timer === null) return;
        clearInterval(timer);
        timer = null;
      };

      emit(
        createSnapshot("running", {
          ...initialScanProgress,
          currentPath: fixtureScanResult.root.path,
        }),
      );

      const steps: ScanProgress[] = [
        {
          pathsScanned: 1,
          directoriesScanned: 1,
          filesScanned: 0,
          logicalSizeScanned: 0,
          currentPath: fixtureScanResult.root.path,
        },
        {
          pathsScanned: 2,
          directoriesScanned: 2,
          filesScanned: 0,
          logicalSizeScanned: 0,
          currentPath: fixtureScanResult.root.children[0]?.path ?? fixtureScanResult.root.path,
        },
        {
          pathsScanned: fixtureScanResult.root.childCount + 1,
          directoriesScanned: 3,
          filesScanned: 1,
          logicalSizeScanned: fixtureScanResult.root.logicalSize,
          currentPath: null,
        },
      ];
      let index = 0;

      timer = setInterval(() => {
        const progress = steps[index];
        if (!progress) {
          clearTimer();
          emit(cloneSnapshot(completeSnapshot));
          return;
        }

        index += 1;
        emit(
          createSnapshot(
            index === steps.length ? "complete" : "running",
            progress,
            fixtureScanResult,
          ),
        );
        if (index === steps.length) clearTimer();
      }, 300);

      return {
        cancel: clearTimer,
      };
    },
  };
}

function createSnapshot(
  state: ScanLifecycleState,
  progress: ScanProgress,
  result: ScanResult | null = null,
): ScanLifecycleSnapshot {
  return {
    state,
    progress: { ...progress },
    result,
    error: null,
  };
}
