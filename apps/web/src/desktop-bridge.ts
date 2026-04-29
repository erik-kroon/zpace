import { initialScanProgress, type ScanLifecycleSnapshot } from "@zpace/scanner/src/schema";

import { createFixtureScanSession, createScanSession, type ScanSession } from "@/scan-session";

type DesktopScanSnapshotMessage = {
  snapshot: ScanLifecycleSnapshot;
};

type ZpaceDesktopRPCSchema = {
  bun: {
    requests: {
      getDefaultScanPath: { params: void; response: { path: string } };
      startScan: { params: { path: string }; response: { accepted: true } };
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
    getDefaultScanPath: () => Promise<{ path: string }>;
    startScan: (params: { path: string }) => Promise<{ accepted: true }>;
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
}> {
  const rpc = await getDesktopRPC();
  if (!rpc) {
    return {
      session: createFixtureScanSession(),
      mode: "fixture",
      defaultPath: "~",
    };
  }

  const defaultPath = await rpc.request.getDefaultScanPath().then(
    (result) => result.path,
    () => "~",
  );
  let emitSnapshot: ((snapshot: ScanLifecycleSnapshot) => void) | null = null;

  rpc.addMessageListener("scanSnapshot", ({ snapshot }) => {
    emitSnapshot?.(snapshot);
  });

  return {
    session: createScanSession({
      initialSnapshot: idleSnapshot,
      start(emit, path) {
        emitSnapshot = emit;
        const targetPath = path?.trim() || defaultPath;
        emit({
          state: "starting",
          progress: { ...initialScanProgress, currentPath: targetPath },
          result: null,
          error: null,
        });

        void rpc.request.startScan({ path: targetPath }).catch((error: unknown) => {
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
    }),
    mode: "desktop",
    defaultPath,
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
