import { describe, expect, test } from "vitest";

import { fixtureScanResult } from "@/fixtures/scan-result";
import {
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
      { label: "status", value: "partial" },
      { label: "warnings", value: "1" },
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
          currentPath: null,
        },
        result: fixtureScanResult,
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

  test("presents incomplete scan warnings with guidance", () => {
    expect(getIncompleteScanMessage(fixtureScanResult)).toBe(
      "Scan incomplete: 1 inaccessible. Reported sizes include scanned space only.",
    );
    expect(createScanWarningRows(fixtureScanResult)).toEqual([
      {
        diagnostic: fixtureScanResult.diagnostics[0],
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
        { label: "inaccessible", value: "1" },
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

  test("formats byte ranges consistently", () => {
    expect(formatBytes(999)).toBe("999 B");
    expect(formatBytes(1_500)).toBe("1.5 KB");
    expect(formatBytes(20_000)).toBe("20 KB");
  });
});
