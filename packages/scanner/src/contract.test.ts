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
      expect(result.summary.totalLogicalSize).toBeGreaterThanOrEqual(5);
      expect(result.summary.fileCount).toBe(1);
      expect(result.summary.folderCount).toBe(3);
      expect(result.summary.inaccessibleCount).toBe(0);
      expect(result.summary.skippedCount).toBe(0);
      expect(result.summary.freeSize).toBeNull();
      expect(result.summary.purgeableSize).toBeNull();
      expect(result.summary.largestItems.some((item) => item.name === "main.txt")).toBe(true);
      expect(result.summary.categories.find((item) => item.category === "Developer artifacts")).toMatchObject({
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

  test("bounds serialized children while preserving summary totals", async () => {
    const root = await mkdtemp(join(tmpdir(), "zpace-bounded-"));

    try {
      for (let index = 0; index < 80; index += 1) {
        await writeFile(join(root, `file-${index.toString().padStart(2, "0")}.txt`), "x");
      }

      const scan = runScan({ path: root });
      const result = await scan.completed;

      expect(result.root.childCount).toBe(80);
      expect(result.root.children.length).toBe(64);
      expect(result.root.childrenTruncated).toBe(true);
      expect(result.root.omittedChildCount).toBe(16);
      expect(result.summary.fileCount).toBe(80);
      expect(result.summary.totalLogicalSize).toBe(80);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 20_000);

  test("summarizes generated dependency subtrees approximately by default", async () => {
    const root = await mkdtemp(join(tmpdir(), "zpace-generated-"));
    const dependencyRoot = join(root, "node_modules");

    try {
      await mkdir(join(dependencyRoot, "pkg", "lib"), { recursive: true });
      await writeFile(join(dependencyRoot, "pkg", "lib", "index.js"), "dependency");

      const scan = runScan({ path: root });
      const result = await scan.completed;
      const nodeModules = result.root.children.find((child) => child.name === "node_modules");

      expect(nodeModules).toMatchObject({
        childCount: 0,
        omittedChildCount: 0,
        childrenTruncated: false,
        children: [],
      });
      expect(nodeModules?.logicalSize).toBeGreaterThanOrEqual(0);
      expect(result.summary.fileCount).toBe(0);
      expect(result.summary.folderCount).toBe(2);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 20_000);

  test("deep scan keeps exact generated dependency subtree totals", async () => {
    const root = await mkdtemp(join(tmpdir(), "zpace-generated-deep-"));
    const dependencyRoot = join(root, "node_modules");

    try {
      await mkdir(join(dependencyRoot, "pkg", "lib"), { recursive: true });
      await writeFile(join(dependencyRoot, "pkg", "lib", "index.js"), "dependency");

      const scan = runScan({ path: root, deepScanGenerated: true });
      const result = await scan.completed;
      const nodeModules = result.root.children.find((child) => child.name === "node_modules");

      expect(nodeModules).toMatchObject({
        logicalSize: 10,
        childCount: 1,
        omittedChildCount: 1,
        childrenTruncated: true,
        children: [],
      });
      expect(result.summary.totalLogicalSize).toBe(10);
      expect(result.summary.fileCount).toBe(1);
      expect(result.summary.folderCount).toBe(4);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 20_000);

  test("deep scan of a generated root expands visible children", async () => {
    const root = await mkdtemp(join(tmpdir(), "zpace-generated-root-"));
    const dependencyRoot = join(root, ".venv");

    try {
      await mkdir(join(dependencyRoot, "lib"), { recursive: true });
      await writeFile(join(dependencyRoot, "lib", "site.py"), "dependency");

      const scan = runScan({ path: dependencyRoot, deepScanGenerated: true });
      const result = await scan.completed;

      expect(result.root).toMatchObject({
        name: ".venv",
        logicalSize: 10,
        childCount: 1,
        omittedChildCount: 0,
        childrenTruncated: false,
      });
      expect(result.root.children.map((child) => child.name)).toEqual(["lib"]);
      expect(result.summary.totalLogicalSize).toBe(10);
      expect(result.summary.fileCount).toBe(1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 20_000);

  test("counts duplicate package-manager store entries at each location", async () => {
    const root = await mkdtemp(join(tmpdir(), "zpace-store-cache-"));

    try {
      for (const project of ["app-a", "app-b"]) {
        const packageRoot = join(
          root,
          project,
          "node_modules",
          ".bun",
          "entities@4.5.0+samehash",
          "node_modules",
          "entities",
        );
        await mkdir(packageRoot, { recursive: true });
        await writeFile(join(packageRoot, "index.js"), "shared");
      }

      const scan = runScan({ path: root, deepScanGenerated: true });
      const result = await scan.completed;

      expect(result.summary.totalLogicalSize).toBe(12);
      expect(result.summary.fileCount).toBe(2);
      expect(result.summary.folderCount).toBe(13);
      expect(result.root.children.map((child) => child.name)).toEqual(["app-a", "app-b"]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 20_000);

  test("skips excluded subtrees and reports them as diagnostics", async () => {
    const root = await mkdtemp(join(tmpdir(), "zpace-excludes-"));
    const keptPath = join(root, "kept.txt");
    const skippedPath = join(root, "skip-me");

    try {
      await writeFile(keptPath, "kept");
      await mkdir(skippedPath);
      await writeFile(join(skippedPath, "ignored.txt"), "ignored");

      const scan = runScan({ path: root, excludedPaths: [skippedPath] });
      const result = await scan.completed;

      expect(result.root.status).toBe("partial");
      expect(result.summary.fileCount).toBe(1);
      expect(result.summary.totalLogicalSize).toBe(4);
      expect(result.summary.skippedCount).toBe(1);
      expect(result.root.children.map((child) => child.name)).toEqual(["kept.txt"]);
      expect(result.diagnostics).toContainEqual({
        path: skippedPath,
        kind: "skipped",
        severity: "warning",
        message: "Skipped by scan exclude rule",
        guidance: "Remove this path from scan excludes to include it.",
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 20_000);
});
