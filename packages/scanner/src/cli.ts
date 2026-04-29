#!/usr/bin/env bun
import { formatHumanScanResult } from "./cli-format";
import { runScan } from "./run";

const args = process.argv.slice(2);
const jsonOnly = args.includes("--json");
const targetPath = args.find((arg) => arg !== "--json") ?? ".";

const scan = runScan({
  path: targetPath,
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
