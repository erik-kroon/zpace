import { homedir } from "node:os";
import { join } from "node:path";

import { BrowserView, BrowserWindow, Updater } from "electrobun/bun";
import { runScan, type ScanRun } from "@zpace/scanner/src/run";
import {
  initialScanProgress,
  type ScanLifecycleSnapshot,
  type ScanProgress,
} from "@zpace/scanner/src/schema";

const DEV_SERVER_PORT = 3001;
const DEV_SERVER_URL = `http://localhost:${DEV_SERVER_PORT}`;

// Check if the web dev server is running for HMR
async function getMainViewUrl(): Promise<string> {
  const channel = await Updater.localInfo.channel();
  if (channel === "dev") {
    try {
      await fetch(DEV_SERVER_URL, { method: "HEAD" });
      console.log(`HMR enabled: Using web dev server at ${DEV_SERVER_URL}`);
      return DEV_SERVER_URL;
    } catch {
      console.log('Web dev server not running. Run "bun run dev:hmr" for HMR support.');
    }
  }

  return "views://mainview/index.html";
}

const url = await getMainViewUrl();

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

let activeScan: ScanRun | null = null;
let activeScanVersion = 0;

const rpc = BrowserView.defineRPC<ZpaceDesktopRPCSchema>({
  maxRequestTime: Infinity,
  handlers: {
    requests: {
      getDefaultScanPath() {
        return { path: homedir() };
      },
      startScan({ path }) {
        startDesktopScan(path);
        return { accepted: true };
      },
      cancelScan() {
        if (!activeScan) return { cancelled: false };
        activeScan.cancel();
        activeScan = null;
        activeScanVersion += 1;
        rpc.send.scanSnapshot({
          snapshot: {
            state: "cancelled",
            progress: { ...initialScanProgress, currentPath: null },
            result: null,
            error: null,
          },
        });
        return { cancelled: true };
      },
    },
    messages: {},
  },
});

function startDesktopScan(path: string) {
  activeScan?.cancel();
  activeScanVersion += 1;
  const version = activeScanVersion;
  const targetPath = expandUserPath(path.trim() || homedir());

  rpc.send.scanSnapshot({
    snapshot: {
      state: "starting",
      progress: { ...initialScanProgress, currentPath: targetPath },
      result: null,
      error: null,
    },
  });

  const scan = runScan({
    path: targetPath,
    onEvent(_event, snapshot) {
      if (version !== activeScanVersion) return;
      rpc.send.scanSnapshot({ snapshot: cloneSnapshot(snapshot) });
    },
  });
  activeScan = scan;

  void scan.completed
    .then((result) => {
      if (version !== activeScanVersion) return;
      const progress = activeScan?.snapshot.progress;
      activeScan = null;
      rpc.send.scanSnapshot({
        snapshot: {
          state: "complete",
          progress: createCompletedProgress(progress),
          result,
          error: null,
        },
      });
    })
    .catch((error: unknown) => {
      if (version !== activeScanVersion) return;
      activeScan = null;
      rpc.send.scanSnapshot({
        snapshot: {
          state: "error",
          progress: { ...initialScanProgress, currentPath: null },
          result: null,
          error: error instanceof Error ? error.message : "Scanner failed",
        },
      });
    });
}

function expandUserPath(path: string): string {
  if (path === "~") return homedir();
  if (path.startsWith("~/")) return join(homedir(), path.slice(2));
  return path;
}

function cloneSnapshot(snapshot: ScanLifecycleSnapshot): ScanLifecycleSnapshot {
  return {
    ...snapshot,
    progress: { ...snapshot.progress },
  };
}

function createCompletedProgress(progress: ScanProgress | undefined): ScanProgress {
  return {
    pathsScanned: progress?.pathsScanned ?? 0,
    directoriesScanned: progress?.directoriesScanned ?? 0,
    filesScanned: progress?.filesScanned ?? 0,
    currentPath: null,
  };
}

new BrowserWindow({
  title: "zpace",
  url,
  rpc,
  frame: {
    width: 1280,
    height: 820,
    x: 120,
    y: 120,
  },
});

console.log("Electrobun desktop shell started.");
