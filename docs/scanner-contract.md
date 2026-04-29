# Scanner JSON contract

The production filesystem scan path is owned by the Zig scanner in `packages/scanner/native`.
TypeScript may validate, orchestrate, test, and render scan results, but it must not implement production filesystem traversal or size aggregation.

Run the scanner through the TypeScript CLI wrapper:

```sh
bun run scan -- <path>
```

The CLI invokes `zig build run`, prints terminal-safe lifecycle progress to stderr, and emits the validated final JSON shape below on stdout. Use `--json` to suppress the human progress lines.

```ts
interface ScanResult {
  schemaVersion: 1;
  root: ScanNode;
  diagnostics: ScanDiagnostic[];
}

interface ScanNode {
  path: string;
  name: string;
  type: "file" | "directory" | "symlink" | "other";
  logicalSize: number;
  allocatedSize: number | null;
  childCount: number;
  status: "complete" | "partial" | "error";
  classification: ScanClassification | null;
  children: ScanNode[];
}

interface ScanClassification {
  category: string;
  explanation: string;
  risk: "low" | "medium" | "high";
  recommendation: string;
}

interface ScanDiagnostic {
  path: string;
  kind: "inaccessible" | "skipped";
  severity: "warning" | "error";
  message: string;
}
```

`logicalSize` is aggregated recursively for directories. `allocatedSize` is returned when the platform stat data is available for the item and is `null` for directory summary rows in this first tracer slice.

`classification` is advisory metadata for recognizable developer artifacts and common user cleanup locations. It does not imply automatic deletion. Callers should present the category, explanation, risk, and recommendation so users can decide what to inspect or clean manually.

Diagnostics describe paths the scanner could not include confidently in the tree. Callers should surface these as scan report warnings instead of inferring safety state from missing children.

When the Zig scanner is called with `--events`, it writes newline-delimited lifecycle events to stderr:

```ts
type ScanLifecycleEvent =
  | { type: "started"; path: string }
  | { type: "progress"; progress: ScanProgress }
  | { type: "completed"; progress: ScanProgress };

interface ScanProgress {
  pathsScanned: number;
  directoriesScanned: number;
  filesScanned: number;
  currentPath: string | null;
}
```

TypeScript callers should use `runScan()` from `@zpace/scanner/src/run` to consume these events as a `ScanLifecycleSnapshot` and to cancel active scans via the spawned Zig process.
