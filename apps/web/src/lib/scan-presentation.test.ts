import { describe, expect, test } from "vitest";

import { fixtureScanResult } from "@/fixtures/scan-result";
import type { ScanResult } from "@zpace/scanner/src/schema";
import {
  createCleanupQueueItem,
  createCleanupQueueSummary,
  createCleanupExecutionResult,
  canMoveCleanupQueueToTrash,
  createScanRows,
  createScanReportViewModel,
  createScanWarningRows,
  formatBytes,
  getIncompleteScanMessage,
  summarizeScanResult,
  summarizeScanSnapshot,
} from "@/lib/scan-presentation";

describe("scan presentation", () => {
  test("formats scan rows for list rendering", () => {
    const rows = createScanRows(fixtureScanResult.root);

    expect(rows[0]?.node.name).toBe("zpace");
    expect(rows.find((row) => row.node.name === "package.json")?.sizeLabel).toBe("921 B");
    expect(rows.find((row) => row.node.name === "node_modules")?.node.classification?.risk).toBe("medium");
    expect(rows[0]?.childCountLabel).toBe("4 children");
  });

  test("summarizes a scan report", () => {
    expect(summarizeScanResult(fixtureScanResult)).toEqual([
      { label: "items", value: "4" },
      { label: "size", value: "321 KB" },
      { label: "status", value: "complete" },
      { label: "warnings", value: "0" },
    ]);
  });

  test("summarizes scan session state with diagnostics", () => {
    expect(
      summarizeScanSnapshot({
        state: "complete",
        progress: {
          pathsScanned: 4,
          directoriesScanned: 3,
          filesScanned: 1,
          logicalSizeScanned: fixtureScanResult.root.logicalSize,
          currentPath: null,
        },
        result: fixtureScanResult,
        error: null,
      }),
    ).toEqual([
      { label: "paths", value: "4" },
      { label: "files", value: "1" },
      { label: "size", value: "321 KB" },
      { label: "warnings", value: "0" },
      { label: "state", value: "complete" },
    ]);
  });

  test("presents incomplete scan warnings with guidance", () => {
    const result = createWarningScanResult();

    expect(getIncompleteScanMessage(result)).toBe(
      "Scan incomplete: 1 inaccessible. Reported sizes include scanned space only.",
    );
    expect(createScanWarningRows(result)).toEqual([
      {
        diagnostic: result.diagnostics[0],
        title: "inaccessible warning",
        detail:
          "Permission denied. Grant Full Disk Access to the app or terminal running zpace, then scan again.",
      },
    ]);
  });

  test("creates report summary from scanner summary data", () => {
    expect(createScanReportViewModel(fixtureScanResult)).toEqual({
      metrics: [
        { label: "scanned", value: "321 KB" },
        { label: "allocated", value: "106 KB" },
        { label: "reclaimable", value: "0 B" },
        { label: "files", value: "5" },
        { label: "folders", value: "7" },
        { label: "inaccessible", value: "0" },
        { label: "skipped", value: "0" },
        { label: "protected", value: "0" },
        { label: "free", value: "unavailable" },
        { label: "purgeable", value: "unavailable" },
        { label: "duration", value: "42 ms" },
      ],
      largestItems: [
        { label: "apps", value: "178 KB", detail: "/Users/erik/Projects/zpace/apps" },
        { label: "web", value: "119 KB", detail: "/Users/erik/Projects/zpace/apps/web" },
        { label: "src", value: "83 KB", detail: "/Users/erik/Projects/zpace/apps/web/src" },
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

  test("summarizes cleanup queue selections", () => {
    const nodeModules = fixtureScanResult.root.children.find((node) => node.name === "node_modules");
    const packageJson = fixtureScanResult.root.children.find((node) => node.name === "package.json");

    expect(nodeModules).toBeDefined();
    expect(packageJson).toBeDefined();

    const summary = createCleanupQueueSummary([
      createCleanupQueueItem(nodeModules!),
      createCleanupQueueItem(packageJson!),
    ]);

    expect(summary.itemCountLabel).toBe("2 items");
    expect(summary.totalSizeLabel).toBe("83 KB");
    expect(summary.warning).toBeNull();
    expect(summary.items[0]).toMatchObject({
      path: "/Users/erik/Projects/zpace/node_modules",
      category: "Developer artifacts",
      risk: "medium",
      isProtected: false,
    });
  });

  test("creates dry-run cleanup results without moving items", () => {
    const nodeModules = fixtureScanResult.root.children.find((node) => node.name === "node_modules");
    expect(nodeModules).toBeDefined();

    const result = createCleanupExecutionResult([createCleanupQueueItem(nodeModules!)], {
      dryRun: true,
      trashAvailable: false,
      now: new Date("2026-04-29T08:30:00.000Z"),
      id: "test-run",
    });

    expect(result).toMatchObject({
      id: "test-run",
      completedAt: "2026-04-29T08:30:00.000Z",
      dryRun: true,
      itemCountLabel: "1 item",
      totalSizeLabel: "82 KB",
      status: "dry-run",
    });
    expect(result.results).toEqual([
      {
        path: "/Users/erik/Projects/zpace/node_modules",
        name: "node_modules",
        sizeLabel: "82 KB",
        status: "dry-run",
        message: "Dry run only. This item would be moved to Trash.",
      },
    ]);
  });

  test("blocks protected cleanup items from normal Trash moves", () => {
    const protectedItem = {
      ...createCleanupQueueItem(fixtureScanResult.root),
      isProtected: true,
      protectionReason: "System-adjacent path.",
    };

    expect(canMoveCleanupQueueToTrash([protectedItem])).toBe(false);

    const result = createCleanupExecutionResult([protectedItem], {
      dryRun: false,
      trashAvailable: true,
      now: new Date("2026-04-29T08:31:00.000Z"),
    });

    expect(result.status).toBe("partial");
    expect(result.results[0]).toMatchObject({
      status: "skipped",
      message: "System-adjacent path.",
    });
  });

  test("formats byte ranges consistently", () => {
    expect(formatBytes(999)).toBe("999 B");
    expect(formatBytes(1_500)).toBe("1.5 KB");
    expect(formatBytes(20_000)).toBe("20 KB");
  });
});

function createWarningScanResult(): ScanResult {
  return {
    ...fixtureScanResult,
    root: {
      ...fixtureScanResult.root,
      status: "partial",
    },
    summary: {
      ...fixtureScanResult.summary,
      warningCount: 1,
      inaccessibleCount: 1,
    },
    diagnostics: [
      {
        path: "/Users/erik/Projects/zpace/apps/web/src/private",
        kind: "inaccessible",
        severity: "warning",
        message: "Permission denied",
        guidance: "Grant Full Disk Access to the app or terminal running zpace, then scan again.",
      },
    ],
  };
}
