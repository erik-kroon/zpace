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
  onEvent?: (event: ScanLifecycleEvent, snapshot: ScanLifecycleSnapshot) => void;
}

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function createScannerCommand(path: string): string[] {
  return [
    "zig",
    "build",
    "--build-file",
    resolve(packageRoot, "native/build.zig"),
    "run",
    "--",
    "--events",
    resolve(process.cwd(), path),
  ];
}

export function runScan(options: RunScanOptions): ScanRun {
  const snapshot = createInitialScanLifecycleSnapshot();

  const scanner = Bun.spawn({
    cmd: createScannerCommand(options.path),
    cwd: packageRoot,
    stdout: "pipe",
    stderr: "pipe",
  });

  void readLifecycleEvents(scanner.stderr, (event) => {
    applyLifecycleEvent(snapshot, event);
    options.onEvent?.(event, snapshot);
  }).catch(() => undefined);

  const completed = (async () => {
    const stdout = await new Response(scanner.stdout).text();
    const exitCode = await scanner.exited;

    if (exitCode !== 0) {
      if (snapshot.state === "cancelled") {
        throw new Error("Scan cancelled");
      }
      const error = new Error(`Zig scanner exited with status ${exitCode}`);
      failScan(snapshot, error);
      throw error;
    }

    const parsedJson = parseJson(stdout);
    if (!parsedJson.ok) {
      failScan(snapshot, parsedJson.error);
      throw parsedJson.error;
    }

    const parsed = scanResultSchema.safeParse(parsedJson.value);
    if (!parsed.success) {
      failScan(snapshot, parsed.error);
      throw parsed.error;
    }

    completeScan(snapshot, parsed.data);
    return parsed.data;
  })();

  return {
    snapshot,
    completed,
    cancel() {
      if (!isActiveScanState(snapshot.state)) return;
      cancelScan(snapshot);
      scanner.kill();
    },
  };
}

async function readLifecycleEvents(
  stream: ReadableStream<Uint8Array>,
  onEvent: (event: ScanLifecycleEvent) => void,
) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

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

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) consumeLine(line);
  }

  buffer += decoder.decode();
  consumeLine(buffer);
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
