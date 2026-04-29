import {
  cancelScan,
  createInitialScanLifecycleSnapshot,
  failScan,
  isActiveScanState,
} from "./lifecycle";
import { initialScanProgress, type ScanLifecycleSnapshot } from "./schema";

export interface ScanRuntimeRequest {
  path?: string;
  excludedPaths?: string[];
  deepScanGenerated?: boolean;
}

export interface ResolvedScanRuntimeRequest {
  path: string;
  excludedPaths: string[];
  deepScanGenerated: boolean;
}

export type ScanSnapshotEmitter = (snapshot: ScanLifecycleSnapshot) => void;

export interface ScanRuntimeRun {
  cancel(): void;
}

export interface ScanRuntimeAdapter {
  start: (request: ResolvedScanRuntimeRequest, emit: ScanSnapshotEmitter) => ScanRuntimeRun;
}

export interface ScanRuntimeOptions {
  adapter: ScanRuntimeAdapter;
  initialSnapshot?: ScanLifecycleSnapshot;
  defaultPath: string;
  defaultExcludedPaths?: string[];
  onSnapshot?: ScanSnapshotEmitter;
}

export interface ScanRuntime {
  readonly snapshot: ScanLifecycleSnapshot;
  canCancel(): boolean;
  canRescan(): boolean;
  start(request?: ScanRuntimeRequest): ResolvedScanRuntimeRequest;
  cancel(): boolean;
}

export function createScanRuntime(options: ScanRuntimeOptions): ScanRuntime {
  let snapshot = cloneSnapshot(options.initialSnapshot ?? createInitialScanLifecycleSnapshot());
  let activeRun: ScanRuntimeRun | null = null;
  let runVersion = 0;

  const publish = (nextSnapshot: ScanLifecycleSnapshot, version = runVersion) => {
    if (version !== runVersion) return;

    snapshot = cloneSnapshot(nextSnapshot);
    options.onSnapshot?.(cloneSnapshot(snapshot));
    if (!isActiveScanState(snapshot.state)) {
      activeRun = null;
    }
  };

  const runtime: ScanRuntime = {
    get snapshot() {
      return cloneSnapshot(snapshot);
    },
    canCancel() {
      return isActiveScanState(snapshot.state);
    },
    canRescan() {
      return !isActiveScanState(snapshot.state);
    },
    start(request = {}) {
      activeRun?.cancel();
      runVersion += 1;

      const version = runVersion;
      const resolvedRequest = resolveScanRuntimeRequest(options, request);
      publish(createStartingSnapshot(resolvedRequest.path), version);

      let finishedDuringStart = false;
      const emit = (nextSnapshot: ScanLifecycleSnapshot) => {
        publish(nextSnapshot, version);
        if (!isActiveScanState(nextSnapshot.state)) finishedDuringStart = true;
      };

      try {
        const run = options.adapter.start(resolvedRequest, emit);
        activeRun = finishedDuringStart ? null : run;
      } catch (error) {
        publish(createErrorSnapshot(error), version);
      }

      return resolvedRequest;
    },
    cancel() {
      if (!isActiveScanState(snapshot.state)) return false;

      activeRun?.cancel();
      activeRun = null;
      runVersion += 1;
      snapshot = cancelScan(snapshot);
      options.onSnapshot?.(cloneSnapshot(snapshot));
      return true;
    },
  };

  return runtime;
}

export function cloneSnapshot(snapshot: ScanLifecycleSnapshot): ScanLifecycleSnapshot {
  return {
    ...snapshot,
    progress: { ...snapshot.progress },
  };
}

export function createStartingSnapshot(path: string): ScanLifecycleSnapshot {
  return {
    state: "starting",
    progress: { ...initialScanProgress, currentPath: path },
    result: null,
    error: null,
  };
}

export function createErrorSnapshot(error: unknown): ScanLifecycleSnapshot {
  const normalizedError = error instanceof Error ? error : new Error("Scanner failed");
  return failScan(createInitialScanLifecycleSnapshot(), normalizedError);
}

function resolveScanRuntimeRequest(
  options: ScanRuntimeOptions,
  request: ScanRuntimeRequest,
): ResolvedScanRuntimeRequest {
  return {
    path: request.path?.trim() || options.defaultPath,
    excludedPaths: request.excludedPaths ?? options.defaultExcludedPaths ?? [],
    deepScanGenerated: request.deepScanGenerated ?? false,
  };
}
