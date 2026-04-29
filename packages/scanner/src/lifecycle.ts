import {
  initialScanProgress,
  type ScanLifecycleEvent,
  type ScanLifecycleSnapshot,
  type ScanLifecycleState,
  type ScanResult,
} from "./schema";

export function createInitialScanLifecycleSnapshot(): ScanLifecycleSnapshot {
  return {
    state: "starting",
    progress: { ...initialScanProgress },
    result: null,
    error: null,
  };
}

export function applyLifecycleEvent(
  snapshot: ScanLifecycleSnapshot,
  event: ScanLifecycleEvent,
): ScanLifecycleSnapshot {
  if (snapshot.state === "cancelled") return snapshot;

  if (event.type === "started") {
    snapshot.state = "running";
    snapshot.progress = { ...snapshot.progress, currentPath: event.path };
    return snapshot;
  }

  snapshot.progress = event.progress;
  snapshot.state = event.type === "completed" ? "complete" : "running";
  return snapshot;
}

export function completeScan(
  snapshot: ScanLifecycleSnapshot,
  result: ScanResult,
): ScanLifecycleSnapshot {
  snapshot.state = "complete";
  snapshot.result = result;
  snapshot.error = null;
  return snapshot;
}

export function failScan(snapshot: ScanLifecycleSnapshot, error: Error): ScanLifecycleSnapshot {
  snapshot.state = "error";
  snapshot.error = error.message;
  return snapshot;
}

export function cancelScan(snapshot: ScanLifecycleSnapshot): ScanLifecycleSnapshot {
  if (!isActiveScanState(snapshot.state)) return snapshot;

  snapshot.state = "cancelled";
  snapshot.progress = { ...snapshot.progress, currentPath: null };
  return snapshot;
}

export function isActiveScanState(state: ScanLifecycleState): boolean {
  return state === "starting" || state === "running";
}
