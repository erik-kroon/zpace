import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  applyLifecycleEvent,
  cancelScan,
  completeScan,
  createInitialScanLifecycleSnapshot,
  failScan,
  isActiveScanState,
} from "./lifecycle";
import {
  scanLifecycleEventSchema,
  type ScanLifecycleEvent,
  type ScanLifecycleSnapshot,
  scanResultSchema,
  type ScanResult,
} from "./schema";

export { applyLifecycleEvent } from "./lifecycle";

export interface ScanRun {
  readonly snapshot: ScanLifecycleSnapshot;
  readonly completed: Promise<ScanResult>;
  cancel(): void;
}

export interface RunScanOptions {
  path: string;
  scannerRoot?: string;
  scannerExecutablePath?: string;
  excludedPaths?: string[];
  deepScanGenerated?: boolean;
  onEvent?: (event: ScanLifecycleEvent, snapshot: ScanLifecycleSnapshot) => void;
}

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const scannerBuilds = new Map<string, Promise<void>>();

export function createScannerBuildCommand(scannerRoot = packageRoot): string[] {
  return ["zig", "build", "--build-file", resolve(scannerRoot, "native/build.zig")];
}

export function createScannerExecutablePath(scannerRoot = packageRoot): string {
  return resolve(scannerRoot, "native/zig-out/bin/zpace-scanner");
}

export function createScannerCommand(
  path: string,
  scannerRoot = packageRoot,
  excludedPaths: string[] = [],
  deepScanGenerated = false,
  scannerExecutablePath?: string,
): string[] {
  const cmd = [
    scannerExecutablePath ?? createScannerExecutablePath(scannerRoot),
    "--events",
  ];
  if (deepScanGenerated) {
    cmd.push("--deep-scan");
  }
  for (const excludedPath of excludedPaths) {
    cmd.push("--exclude", resolve(process.cwd(), excludedPath));
  }
  cmd.push(resolve(process.cwd(), path));
  return cmd;
}

export function runScan(options: RunScanOptions): ScanRun {
  const snapshot = createInitialScanLifecycleSnapshot();
  const scannerRoot = options.scannerRoot ?? packageRoot;
  const scannerExecutablePath = options.scannerExecutablePath;
  const scannerCwd = scannerExecutablePath ? dirname(scannerExecutablePath) : scannerRoot;
  let scanner: ReturnType<typeof Bun.spawn> | null = null;
  let cancelled = false;

  const completed = (async () => {
    try {
      await ensureScannerExecutable(scannerRoot, scannerExecutablePath);
      if (cancelled || snapshot.state === "cancelled") {
        throw new Error("Scan cancelled");
      }

      scanner = Bun.spawn({
        cmd: createScannerCommand(
          options.path,
          scannerRoot,
          options.excludedPaths ?? [],
          options.deepScanGenerated ?? false,
          scannerExecutablePath,
        ),
        cwd: scannerCwd,
        stdout: "pipe",
        stderr: "pipe",
      });
      const scannerStdout = requireReadableStream(scanner.stdout, "scanner stdout");
      const scannerStderr = requireReadableStream(scanner.stderr, "scanner stderr");

      const stderrText = readLifecycleEvents(scannerStderr, (event) => {
        applyLifecycleEvent(snapshot, event);
        options.onEvent?.(event, snapshot);
      }).catch(() => "");

      const stdout = await new Response(scannerStdout).text();
      const stderr = await stderrText;
      const exitCode = await scanner.exited;

      if (exitCode !== 0) {
        if (cancelled) {
          throw new Error("Scan cancelled");
        }
        throw new Error(formatScannerFailure(exitCode, stderr));
      }

      const parsedJson = parseJson(stdout);
      if (!parsedJson.ok) throw parsedJson.error;

      const parsed = scanResultSchema.safeParse(parsedJson.value);
      if (!parsed.success) throw parsed.error;

      completeScan(snapshot, parsed.data);
      return parsed.data;
    } catch (error) {
      const normalizedError = error instanceof Error ? error : new Error("Scanner failed");
      if (cancelled) {
        throw new Error("Scan cancelled");
      }
      failScan(snapshot, normalizedError);
      throw normalizedError;
    }
  })();

  return {
    snapshot,
    completed,
    cancel() {
      if (!isActiveScanState(snapshot.state)) return;
      cancelled = true;
      cancelScan(snapshot);
      scanner?.kill();
    },
  };
}

function ensureScannerExecutable(
  scannerRoot: string,
  scannerExecutablePath?: string,
): Promise<void> {
  if (scannerExecutablePath) {
    return verifyScannerExecutable(scannerExecutablePath);
  }

  const existingBuild = scannerBuilds.get(scannerRoot);
  if (existingBuild) return existingBuild;

  const build = buildScannerExecutable(scannerRoot).catch((error) => {
    scannerBuilds.delete(scannerRoot);
    throw error;
  });
  scannerBuilds.set(scannerRoot, build);
  return build;
}

async function verifyScannerExecutable(scannerExecutablePath: string): Promise<void> {
  const executable = Bun.file(scannerExecutablePath);
  if (await executable.exists()) return;
  throw new Error(`Zig scanner executable was not found at ${scannerExecutablePath}`);
}

async function buildScannerExecutable(scannerRoot: string): Promise<void> {
  const build = Bun.spawn({
    cmd: createScannerBuildCommand(scannerRoot),
    cwd: scannerRoot,
    stdout: "ignore",
    stderr: "pipe",
  });

  const stderr = await new Response(requireReadableStream(build.stderr, "scanner build stderr")).text();
  const exitCode = await build.exited;
  if (exitCode === 0) return;

  const detail = formatScannerFailure(exitCode, stderr);
  throw new Error(`Zig scanner build failed:\n${detail}`);
}

function requireReadableStream(
  value: ReadableStream<Uint8Array> | number | undefined,
  name: string,
): ReadableStream<Uint8Array> {
  if (value instanceof ReadableStream) return value;
  throw new Error(`${name} was not opened as a readable stream`);
}

async function readLifecycleEvents(
  stream: ReadableStream<Uint8Array>,
  onEvent: (event: ScanLifecycleEvent) => void,
): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";

  const consumeLine = (line: string) => {
    if (!line.trim()) return;
    const parsedJson = parseJson(line);
    if (!parsedJson.ok) return;
    const parsed = scanLifecycleEventSchema.safeParse(parsedJson.value);
    if (parsed.success) onEvent(parsed.data);
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    text += chunk;
    buffer += chunk;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) consumeLine(line);
  }

  const finalChunk = decoder.decode();
  text += finalChunk;
  buffer += finalChunk;
  consumeLine(buffer);
  return text;
}

function formatScannerFailure(exitCode: number, stderr: string): string {
  const detail = stderr
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("{\"type\":"))
    .slice(-6)
    .join("\n");

  return detail
    ? `Zig scanner exited with status ${exitCode}:\n${detail}`
    : `Zig scanner exited with status ${exitCode}`;
}

function parseJson(text: string): { ok: true; value: unknown } | { ok: false; error: Error } {
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch (cause) {
    return {
      ok: false,
      error: cause instanceof Error ? cause : new Error("Invalid scanner JSON"),
    };
  }
}
