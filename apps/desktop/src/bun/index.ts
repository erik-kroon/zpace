import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { ApplicationMenu, BrowserView, BrowserWindow, Updater } from "electrobun/bun";
import { runScan, type ScanRun } from "@zpace/scanner/src/run";
import {
  type ScanLifecycleSnapshot,
  type ScanProgress,
} from "@zpace/scanner/src/schema";
import { createScanRuntime, type ScanRuntime } from "@zpace/scanner/src/runtime";

const DEV_SERVER_PORT = 3001;
const DEV_SERVER_URL = `http://localhost:${DEV_SERVER_PORT}`;
const scannerSourceRoot = findScannerSourceRoot();
const scannerExecutablePath = findScannerExecutablePath();
const defaultScanPath = findDefaultScanPath();
const defaultExcludedPaths = createDefaultExcludedPaths();

ApplicationMenu.setApplicationMenu([
  {
    label: "Edit",
    submenu: [
      { role: "undo", accelerator: "CommandOrControl+Z" },
      { role: "redo", accelerator: "Shift+CommandOrControl+Z" },
      { type: "divider" },
      { role: "cut", accelerator: "CommandOrControl+X" },
      { role: "copy", accelerator: "CommandOrControl+C" },
      { role: "paste", accelerator: "CommandOrControl+V" },
      { role: "selectAll", accelerator: "CommandOrControl+A" },
    ],
  },
]);

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

let scanRuntime: ScanRuntime;

const rpc = BrowserView.defineRPC<ZpaceDesktopRPCSchema>({
  maxRequestTime: Infinity,
  handlers: {
    requests: {
      getDefaultScanPath() {
        return { path: defaultScanPath, homePath: homedir(), excludedPaths: defaultExcludedPaths };
      },
      startScan({ path, excludedPaths, deepScanGenerated }) {
        scanRuntime.start({
          path: expandUserPath(path),
          excludedPaths: (excludedPaths ?? defaultExcludedPaths).map(expandUserPath),
          deepScanGenerated,
        });
        return { accepted: true };
      },
      cancelScan() {
        return { cancelled: scanRuntime.cancel() };
      },
    },
    messages: {},
  },
});

scanRuntime = createScanRuntime({
  defaultPath: defaultScanPath,
  defaultExcludedPaths,
  onSnapshot(snapshot) {
    rpc.send.scanSnapshot({ snapshot });
  },
  adapter: {
    start(request, emit) {
      const effectiveExcludedPaths = filterExcludedPathsForTarget(request.path, request.excludedPaths);
      const scan: ScanRun = runScan({
        path: request.path,
        scannerRoot: scannerSourceRoot,
        scannerExecutablePath,
        excludedPaths: effectiveExcludedPaths,
        deepScanGenerated: request.deepScanGenerated,
        onEvent(_event, snapshot) {
          emit(snapshot);
        },
      });

      void scan.completed
        .then((result) => {
          emit({
            state: "complete",
            progress: createCompletedProgress(scan.snapshot.progress),
            result,
            error: null,
          });
        })
        .catch((error: unknown) => {
          emit({
            state: "error",
            progress: createCompletedProgress(undefined),
            result: null,
            error: error instanceof Error ? error.message : "Scanner failed",
          });
        });

      return {
        cancel() {
          scan.cancel();
        },
      };
    },
  },
});

function expandUserPath(path: string): string {
  if (path === "~") return homedir();
  if (path.startsWith("~/")) return join(homedir(), path.slice(2));
  return path;
}

function findScannerExecutablePath(): string | undefined {
  const candidates = [
    process.env.ZPACE_SCANNER_EXECUTABLE,
    resolve(dirname(process.argv0), "../Resources/app/scanner/zpace-scanner"),
    resolve(process.cwd(), "../Resources/app/scanner/zpace-scanner"),
  ].filter((candidate): candidate is string => Boolean(candidate));

  return candidates.find((candidate) => existsSync(candidate));
}

function findScannerSourceRoot(): string | undefined {
  const initialCwd = process.env.INIT_CWD;
  const candidates = [
    process.env.ZPACE_SCANNER_ROOT,
    initialCwd ? resolve(initialCwd, "packages/scanner") : null,
    initialCwd ? resolve(initialCwd, "../../packages/scanner") : null,
    resolve(process.cwd(), "packages/scanner"),
    resolve(process.cwd(), "../packages/scanner"),
    resolve(process.cwd(), "../../packages/scanner"),
    resolve(process.cwd(), "../../../packages/scanner"),
    resolve(process.cwd(), "../../../../packages/scanner"),
    resolve(process.cwd(), "../../../../../packages/scanner"),
    resolve(process.cwd(), "../../../../../../packages/scanner"),
    resolve(process.cwd(), "../../../../../../../packages/scanner"),
  ].filter((candidate): candidate is string => Boolean(candidate));

  const scannerRoot = candidates.find((candidate) =>
    existsSync(resolve(candidate, "native/build.zig")),
  );
  if (!scannerRoot && !findScannerExecutablePath()) {
    throw new Error(
      `Could not locate the bundled zpace scanner executable or packages/scanner/native/build.zig from ${process.cwd()}. Set ZPACE_SCANNER_EXECUTABLE or ZPACE_SCANNER_ROOT.`,
    );
  }
  return scannerRoot;
}

function findDefaultScanPath(): string {
  const initialCwd = process.env.INIT_CWD;
  const candidates = [
    process.env.ZPACE_DEFAULT_SCAN_PATH,
    initialCwd && existsSync(resolve(initialCwd, "package.json")) ? initialCwd : null,
    scannerSourceRoot ? resolve(scannerSourceRoot, "../..") : null,
    homedir(),
  ].filter((candidate): candidate is string => Boolean(candidate));

  return candidates[0] ?? homedir();
}

function createDefaultExcludedPaths(): string[] {
  const home = homedir();
  return [
    join(home, "Library/CloudStorage"),
    join(home, "Library/Mobile Documents"),
    join(home, "Library/Group Containers/group.com.apple.FileProvider"),
    join(home, "Library/Application Support/FileProvider"),
    join(home, "Library/Metadata/CoreSpotlight"),
  ].filter((path) => existsSync(path));
}

function filterExcludedPathsForTarget(targetPath: string, excludedPaths: string[]): string[] {
  const normalizedTarget = normalizePath(targetPath);
  return excludedPaths
    .map(normalizePath)
    .filter((path) => path.length > 0)
    .filter((path) => !isSameOrChildPath(normalizedTarget, path));
}

function isSameOrChildPath(path: string, parentPath: string): boolean {
  return path === parentPath || path.startsWith(`${parentPath}/`);
}

function normalizePath(path: string): string {
  return resolve(path).replace(/\/+$/, "");
}

function createCompletedProgress(progress: ScanProgress | undefined): ScanProgress {
  return {
    pathsScanned: progress?.pathsScanned ?? 0,
    directoriesScanned: progress?.directoriesScanned ?? 0,
    filesScanned: progress?.filesScanned ?? 0,
    logicalSizeScanned: progress?.logicalSizeScanned ?? 0,
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
