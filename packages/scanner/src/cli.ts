#!/usr/bin/env bun
import { formatHumanScanResult } from "./cli-format";
import { runScan } from "./run";

const args = process.argv.slice(2);
const jsonOnly = args.includes("--json");
const deepScanGenerated = args.includes("--deep-scan");
const excludedPaths: string[] = [];
const positionalArgs: string[] = [];

for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (!arg) continue;
  if (arg === "--json") continue;
  if (arg === "--deep-scan") continue;
  if (arg === "--exclude") {
    const excludedPath = args[index + 1];
    if (typeof excludedPath !== "string") {
      process.stderr.write("usage: zpace scan [--json] [--deep-scan] [--exclude <path>] <path>\n");
      process.exit(64);
    }
    excludedPaths.push(excludedPath);
    index += 1;
    continue;
  }
  positionalArgs.push(arg);
}

const targetPath = positionalArgs[0] ?? ".";

const scan = runScan({
  path: targetPath,
  excludedPaths,
  deepScanGenerated,
  onEvent(event) {
    if (jsonOnly) return;

    if (event.type === "started") {
      process.stderr.write(`scan started: ${event.path}\n`);
      return;
    }

    const label = event.type === "completed" ? "scan complete" : "scan progress";
    process.stderr.write(
      `${label}: ${event.progress.pathsScanned} paths, ${event.progress.directoriesScanned} dirs, ${event.progress.filesScanned} files\n`,
    );
  },
});

try {
  const result = await scan.completed;
  process.stdout.write(jsonOnly ? `${JSON.stringify(result, null, 2)}\n` : formatHumanScanResult(result));
} catch (error) {
  const message = error instanceof Error ? error.message : "Scanner failed";
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
