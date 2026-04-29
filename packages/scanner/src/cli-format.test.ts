import { describe, expect, test } from "bun:test";

import { formatHumanScanResult } from "./cli-format";
import { scanResultSchema } from "./schema";

describe("scanner CLI formatting", () => {
  test("prints incomplete scan warnings with guidance in human output", () => {
    const result = scanResultSchema.parse({
      schemaVersion: 1,
      root: {
        path: "/tmp/zpace",
        name: "zpace",
        type: "directory",
        logicalSize: 12,
        allocatedSize: null,
        childCount: 1,
        status: "partial",
        classification: null,
        children: [],
      },
      summary: {
        totalLogicalSize: 12,
        totalAllocatedSize: null,
        likelyReclaimableSize: 0,
        fileCount: 0,
        folderCount: 1,
        warningCount: 1,
        inaccessibleCount: 1,
        skippedCount: 0,
        protectedCount: 0,
        freeSize: null,
        purgeableSize: null,
        durationMs: 7,
        largestItems: [
          {
            path: "/tmp/zpace/private",
            name: "private",
            type: "directory",
            logicalSize: 12,
            classification: null,
          },
        ],
        categories: [
          {
            category: "Developer artifacts",
            logicalSize: 12,
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

    expect(formatHumanScanResult(result)).toContain("Scan partial: /tmp/zpace");
    expect(formatHumanScanResult(result)).toContain("Files: 0");
    expect(formatHumanScanResult(result)).toContain("Folders: 1");
    expect(formatHumanScanResult(result)).toContain("Inaccessible paths: 1");
    expect(formatHumanScanResult(result)).toContain("Free space: unavailable");
    expect(formatHumanScanResult(result)).toContain("Purgeable space: unavailable");
    expect(formatHumanScanResult(result)).toContain("Duration: 7 ms");
    expect(formatHumanScanResult(result)).toContain("Largest items:");
    expect(formatHumanScanResult(result)).toContain("Category breakdown:");
    expect(formatHumanScanResult(result)).toContain("Warnings: 1");
    expect(formatHumanScanResult(result)).toContain("Full Disk Access");
  });
});
