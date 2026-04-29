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

export function createFixtureScanSession(): ScanSession {
  const [snapshot, setSnapshot] = createSignal<ScanLifecycleSnapshot>(completeSnapshot);
  let timer: ReturnType<typeof setInterval> | null = null;

  const clearTimer = () => {
    if (timer === null) return;
    clearInterval(timer);
    timer = null;
  };

  const setState = (
    state: ScanLifecycleState,
    progress: ScanProgress,
    result: ScanResult | null = null,
  ) => setSnapshot({ state, progress, result, error: null });

  const startRescan = () => {
    clearTimer();
    setState("running", {
      ...initialScanProgress,
      currentPath: fixtureScanResult.root.path,
    });

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
        setState("complete", completeSnapshot.progress, fixtureScanResult);
        return;
      }

      index += 1;
      setState(index === steps.length ? "complete" : "running", progress, fixtureScanResult);
      if (index === steps.length) clearTimer();
    }, 300);
  };

  const cancel = () => {
    if (snapshot().state !== "running" && snapshot().state !== "starting") return;
    clearTimer();
    setState("cancelled", { ...snapshot().progress, currentPath: null });
  };

  return {
    snapshot,
    canCancel: () => snapshot().state === "running" || snapshot().state === "starting",
    canRescan: () => !["running", "starting"].includes(snapshot().state),
    startRescan,
    cancel,
  };
}
