import { describe, expect, test } from "vitest";

import { fixtureScanResult } from "@/fixtures/scan-result";
import {
  createScanRows,
  formatBytes,
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

  test("formats byte ranges consistently", () => {
    expect(formatBytes(999)).toBe("999 B");
    expect(formatBytes(1_500)).toBe("1.5 KB");
    expect(formatBytes(20_000)).toBe("20 KB");
  });
});
