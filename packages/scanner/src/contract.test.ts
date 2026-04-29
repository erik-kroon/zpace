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
      expect(result.root.children.find((child) => child.name === "node_modules")?.classification).toMatchObject({
        category: "Dependency folder",
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
      expect(result.diagnostics).toContainEqual({
        path: inaccessiblePath,
        kind: "inaccessible",
        severity: "error",
        message: "AccessDenied",
      });
    } finally {
      await chmod(inaccessiblePath, 0o700).catch(() => {});
      await rm(root, { recursive: true, force: true });
    }
  }, 20_000);
});
