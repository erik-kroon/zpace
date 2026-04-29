import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  initialScanProgress,
  scanLifecycleEventSchema,
  type ScanLifecycleEvent,
  type ScanLifecycleSnapshot,
  scanResultSchema,
  type ScanResult,
} from "./schema";

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
  const snapshot: ScanLifecycleSnapshot = {
    state: "starting",
    progress: { ...initialScanProgress },
    result: null,
    error: null,
  };

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
      snapshot.state = "error";
      snapshot.error = `Zig scanner exited with status ${exitCode}`;
      throw new Error(snapshot.error);
    }

    const parsedJson = parseJson(stdout);
    if (!parsedJson.ok) {
      snapshot.state = "error";
      snapshot.error = parsedJson.error.message;
      throw parsedJson.error;
    }

    const parsed = scanResultSchema.safeParse(parsedJson.value);
    if (!parsed.success) {
      snapshot.state = "error";
      snapshot.error = parsed.error.message;
      throw parsed.error;
    }

    snapshot.state = "complete";
    snapshot.result = parsed.data;
    return parsed.data;
  })();

  return {
    snapshot,
    completed,
    cancel() {
      if (snapshot.state !== "starting" && snapshot.state !== "running") return;
      snapshot.state = "cancelled";
      snapshot.progress = { ...snapshot.progress, currentPath: null };
      scanner.kill();
    },
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
