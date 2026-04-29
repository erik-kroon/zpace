import { chmod, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, test } from "bun:test";

import { runScan } from "./run";

describe("native scanner contract", () => {
  test("emits scan JSON accepted by the TypeScript contract", async () => {
    const root = await mkdtemp(join(tmpdir(), "zpace-contract-"));

    try {
      await mkdir(join(root, "src"));
      await mkdir(join(root, "node_modules"));
      await writeFile(join(root, "src", "main.txt"), "zpace");

      const scan = runScan({ path: root });
      const result = await scan.completed;

      expect(result.schemaVersion).toBe(1);
      expect(result.root.path).toBe(root);
      expect(result.root.status).toBe("complete");
      expect(result.root.children.some((child) => child.name === "src")).toBe(true);
      expect(result.summary.totalLogicalSize).toBe(5);
      expect(result.summary.fileCount).toBe(1);
      expect(result.summary.folderCount).toBe(3);
      expect(result.summary.inaccessibleCount).toBe(0);
      expect(result.summary.skippedCount).toBe(0);
      expect(result.summary.freeSize).toBeNull();
      expect(result.summary.purgeableSize).toBeNull();
      expect(result.summary.largestItems[0]?.name).toBe("main.txt");
      expect(result.summary.categories.find((item) => item.category === "Developer artifacts")).toMatchObject({
        logicalSize: 0,
        itemCount: 1,
      });
      expect(result.root.children.find((child) => child.name === "node_modules")?.classification).toMatchObject({
        category: "Developer artifacts",
        risk: "medium",
      });
      expect(result.diagnostics).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 20_000);

  test("reports inaccessible child paths as diagnostics", async () => {
    const root = await mkdtemp(join(tmpdir(), "zpace-diagnostics-"));
    const inaccessiblePath = join(root, "private");

    try {
      await mkdir(inaccessiblePath);
      await chmod(inaccessiblePath, 0);

      const scan = runScan({ path: root });
      const result = await scan.completed;

      expect(result.root.status).toBe("partial");
      expect(result.summary.warningCount).toBe(1);
      expect(result.summary.inaccessibleCount).toBe(1);
      expect(result.diagnostics).toContainEqual({
        path: inaccessiblePath,
        kind: "inaccessible",
        severity: "warning",
        message: "Permission denied",
        guidance: "Grant Full Disk Access to the app or terminal running zpace, then scan again.",
      });
    } finally {
      await chmod(inaccessiblePath, 0o700).catch(() => {});
      await rm(root, { recursive: true, force: true });
    }
  }, 20_000);
});
