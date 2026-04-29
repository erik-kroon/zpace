import { describe, expect, test } from "bun:test";

import {
  createScanReportViewModel,
  createScanWarningRows,
  formatBytes,
  formatDuration,
  formatOptionalBytes,
  getIncompleteScanMessage,
  summarizeScanResult,
  summarizeScanSnapshot,
} from "./presentation";
import { initialScanProgress, scanResultSchema } from "./schema";

const result = scanResultSchema.parse({
  schemaVersion: 1,
  root: {
    path: "/tmp/zpace",
    name: "zpace",
    type: "directory",
    logicalSize: 321_000,
    allocatedSize: null,
    childCount: 4,
    status: "partial",
    classification: null,
    children: [],
  },
  summary: {
    totalLogicalSize: 321_000,
    totalAllocatedSize: 106_000,
    likelyReclaimableSize: 0,
    fileCount: 5,
    folderCount: 7,
    warningCount: 1,
    inaccessibleCount: 1,
    skippedCount: 0,
    protectedCount: 0,
    freeSize: null,
    purgeableSize: null,
    durationMs: 42,
    largestItems: [
      {
        path: "/tmp/zpace/node_modules",
        name: "node_modules",
        type: "directory",
        logicalSize: 82_000,
        classification: {
          category: "Developer artifacts",
          explanation: "Installed project dependencies.",
          risk: "medium",
          recommendation: "Review active projects before removing.",
        },
      },
    ],
    categories: [
      {
        category: "Developer artifacts",
        logicalSize: 82_000,
        itemCount: 1,
        likelyReclaimableSize: 0,
      },
    ],
  },
  diagnostics: [
    {
      path: "/tmp/zpace/private",
      kind: "inaccessible",
      severity: "warning",
      message: "Permission denied",
      guidance: "Grant Full Disk Access to the app or terminal running zpace, then scan again.",
    },
  ],
});

describe("scanner presentation", () => {
  test("summarizes scan result and lifecycle snapshots", () => {
    expect(summarizeScanResult(result)).toEqual([
      { label: "items", value: "4" },
      { label: "size", value: "321 KB" },
      { label: "status", value: "partial" },
      { label: "warnings", value: "1" },
    ]);
    expect(
      summarizeScanSnapshot({
        state: "complete",
        progress: { ...initialScanProgress, pathsScanned: 4, filesScanned: 1 },
        result,
        error: null,
      }),
    ).toEqual([
      { label: "paths", value: "4" },
      { label: "files", value: "1" },
      { label: "size", value: "321 KB" },
      { label: "warnings", value: "1" },
      { label: "state", value: "complete" },
    ]);
  });

  test("creates shared report and warning rows", () => {
    expect(getIncompleteScanMessage(result)).toBe(
      "Scan incomplete: 1 inaccessible. Reported sizes include scanned space only.",
    );
    expect(createScanWarningRows(result)[0]?.detail).toContain("Full Disk Access");
    expect(createScanReportViewModel(result)).toEqual({
      metrics: [
        { label: "scanned", value: "321 KB" },
        { label: "allocated", value: "106 KB" },
        { label: "reclaimable", value: "0 B" },
        { label: "files", value: "5" },
        { label: "folders", value: "7" },
        { label: "inaccessible", value: "1" },
        { label: "skipped", value: "0" },
        { label: "protected", value: "0" },
        { label: "free", value: "unavailable" },
        { label: "purgeable", value: "unavailable" },
        { label: "duration", value: "42 ms" },
      ],
      largestItems: [
        { label: "node_modules", value: "82 KB", detail: "Developer artifacts" },
      ],
      categories: [
        {
          label: "Developer artifacts",
          value: "82 KB",
          detail: "1 items, 0 B likely reclaimable",
        },
      ],
    });
  });

  test("formats bytes, optional bytes, and durations consistently", () => {
    expect(formatBytes(999)).toBe("999 B");
    expect(formatBytes(1_500)).toBe("1.5 KB");
    expect(formatBytes(20_000)).toBe("20 KB");
    expect(formatOptionalBytes(null)).toBe("-");
    expect(formatDuration(1_500)).toBe("1.5 s");
  });
});
