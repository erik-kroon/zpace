import { initialScanProgress, type ScanLifecycleSnapshot } from "@zpace/scanner/src/schema";

import { createFixtureScanSession, createScanSession, type ScanSession } from "@/scan-session";

type DesktopScanSnapshotMessage = {
  snapshot: ScanLifecycleSnapshot;
};

type ZpaceDesktopRPCSchema = {
  bun: {
    requests: {
      getDefaultScanPath: { params: void; response: { path: string; homePath: string; excludedPaths: string[] } };
      startScan: {
        params: { path: string; excludedPaths?: string[]; deepScanGenerated?: boolean };
        response: { accepted: true };
      };
      cancelScan: { params: void; response: { cancelled: boolean } };
    };
    messages: Record<never, never>;
  };
  webview: {
    requests: Record<never, never>;
    messages: {
      scanSnapshot: DesktopScanSnapshotMessage;
    };
  };
};

type ZpaceDesktopRPC = {
  request: {
    getDefaultScanPath: () => Promise<{ path: string; homePath: string; excludedPaths: string[] }>;
    startScan: (params: {
      path: string;
      excludedPaths?: string[];
      deepScanGenerated?: boolean;
    }) => Promise<{ accepted: true }>;
    cancelScan: () => Promise<{ cancelled: boolean }>;
  };
  addMessageListener: (
    message: "scanSnapshot",
    listener: (payload: DesktopScanSnapshotMessage) => void,
  ) => void;
};

declare global {
  interface Window {
    __electrobun?: unknown;
    __zpaceDesktopRPC?: ZpaceDesktopRPC;
  }
}

const idleSnapshot: ScanLifecycleSnapshot = {
  state: "idle",
  progress: { ...initialScanProgress },
  result: null,
  error: null,
};

export async function createBestAvailableScanSession(): Promise<{
  session: ScanSession;
  mode: "desktop" | "fixture";
  defaultPath: string;
  homePath: string | null;
  defaultExcludedPaths: string[];
}> {
  const rpc = await getDesktopRPC();
  if (!rpc) {
    return {
      session: createFixtureScanSession(),
      mode: "fixture",
      defaultPath: "~",
      homePath: null,
      defaultExcludedPaths: [],
    };
  }

  const defaultPaths = await rpc.request.getDefaultScanPath().catch(() => ({
    path: "~",
    homePath: "~",
    excludedPaths: [],
  }));
  let emitSnapshot: ((snapshot: ScanLifecycleSnapshot) => void) | null = null;

  rpc.addMessageListener("scanSnapshot", ({ snapshot }) => {
    emitSnapshot?.(snapshot);
  });

  return {
    session: createScanSession(
      {
        initialSnapshot: idleSnapshot,
        start(request, emit) {
          emitSnapshot = emit;

          void rpc.request
            .startScan({
              path: request.path,
              excludedPaths: request.excludedPaths,
              deepScanGenerated: request.deepScanGenerated,
            })
            .catch((error: unknown) => {
              emit({
                state: "error",
                progress: { ...initialScanProgress, currentPath: null },
                result: null,
                error: error instanceof Error ? error.message : "Failed to start scan",
              });
            });

          return {
            cancel() {
              void rpc.request.cancelScan();
            },
          };
        },
      },
      { path: defaultPaths.path, excludedPaths: defaultPaths.excludedPaths },
    ),
    mode: "desktop",
    defaultPath: defaultPaths.path,
    homePath: defaultPaths.homePath,
    defaultExcludedPaths: defaultPaths.excludedPaths,
  };
}

async function getDesktopRPC(): Promise<ZpaceDesktopRPC | null> {
  if (window.__zpaceDesktopRPC) return window.__zpaceDesktopRPC;
  if (!window.__electrobun) return null;

  const { Electroview } = await import("electrobun/view");
  const rpc = Electroview.defineRPC<ZpaceDesktopRPCSchema>({
    maxRequestTime: Infinity,
    handlers: {
      requests: {},
      messages: {},
    },
  });

  new Electroview({ rpc });
  window.__zpaceDesktopRPC = rpc as unknown as ZpaceDesktopRPC;
  return window.__zpaceDesktopRPC;
}
