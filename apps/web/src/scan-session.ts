import { createSignal } from "solid-js";

import { fixtureScanResult } from "@/fixtures/scan-result";
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
  startRescan: () => void;
  cancel: () => void;
}

export type ScanSnapshotEmitter = (snapshot: ScanLifecycleSnapshot) => void;

export interface ScanSessionRun {
  cancel: () => void;
}

export interface ScanSessionAdapter {
  initialSnapshot: ScanLifecycleSnapshot;
  start: (emit: ScanSnapshotEmitter) => ScanSessionRun;
}

const completeSnapshot: ScanLifecycleSnapshot = {
  state: "complete",
  progress: {
    pathsScanned: fixtureScanResult.root.childCount + 1,
    directoriesScanned: 3,
    filesScanned: 1,
    currentPath: null,
  },
  result: fixtureScanResult,
  error: null,
};

export function createScanSession(adapter: ScanSessionAdapter): ScanSession {
  const [snapshot, setSnapshot] = createSignal<ScanLifecycleSnapshot>(
    cloneSnapshot(adapter.initialSnapshot),
  );
  let activeRun: ScanSessionRun | null = null;
  let runVersion = 0;

  const applySnapshot = (nextSnapshot: ScanLifecycleSnapshot, version: number) => {
    if (version !== runVersion) return;

    setSnapshot(cloneSnapshot(nextSnapshot));
    if (!isActiveScanState(nextSnapshot.state)) {
      activeRun = null;
    }
  };

  const startRescan = () => {
    activeRun?.cancel();
    runVersion += 1;

    const version = runVersion;
    let finishedDuringStart = false;
    const run = adapter.start((nextSnapshot) => {
      applySnapshot(nextSnapshot, version);
      if (!isActiveScanState(nextSnapshot.state)) finishedDuringStart = true;
    });
    activeRun = finishedDuringStart ? null : run;
  };

  const cancel = () => {
    if (!isActiveScanState(snapshot().state)) return;

    activeRun?.cancel();
    activeRun = null;
    runVersion += 1;
    setSnapshot(createCancelledSnapshot(snapshot()));
  };

  return {
    snapshot,
    canCancel: () => isActiveScanState(snapshot().state),
    canRescan: () => !isActiveScanState(snapshot().state),
    startRescan,
    cancel,
  };
}

export function createFixtureScanSession(): ScanSession {
  return createScanSession(createFixtureScanSessionAdapter());
}

export function createFixtureScanSessionAdapter(): ScanSessionAdapter {
  return {
    initialSnapshot: completeSnapshot,
    start(emit) {
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
          currentPath: fixtureScanResult.root.path,
        },
        {
          pathsScanned: 2,
          directoriesScanned: 2,
          filesScanned: 0,
          currentPath: fixtureScanResult.root.children[0]?.path ?? fixtureScanResult.root.path,
        },
        {
          pathsScanned: fixtureScanResult.root.childCount + 1,
          directoriesScanned: 3,
          filesScanned: 1,
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

function createCancelledSnapshot(snapshot: ScanLifecycleSnapshot): ScanLifecycleSnapshot {
  return createSnapshot("cancelled", { ...snapshot.progress, currentPath: null });
}

function cloneSnapshot(snapshot: ScanLifecycleSnapshot): ScanLifecycleSnapshot {
  return {
    ...snapshot,
    progress: { ...snapshot.progress },
  };
}

function isActiveScanState(state: ScanLifecycleState): boolean {
  return state === "starting" || state === "running";
}
