import { describe, expect, test } from "vitest";
import { render } from "solid-js/web";
import type { ScanNode } from "@zpace/scanner/src/schema";

import { ScanList } from "@/components/scan-list";
import { fixtureScanResult } from "@/fixtures/scan-result";

describe("ScanList", () => {
  test("renders scanner fixture rows with size and path", () => {
    const { dispose, host } = renderScanList();
    const html = host.textContent ?? "";

    expect(html).toContain("package.json");
    expect(html).toContain("/Users/erik/Projects/zpace/package.json");
    expect(html).toContain("921 B");
    expect(html).toContain("Developer artifacts");
    expect(html).toContain("Usually safe");
    expect(html).toContain("Usually recoverable by reinstalling dependencies");
    expect(html).toContain("complete");
    cleanup(dispose, host);
  });

  test("drills into folders and navigates back with breadcrumbs", () => {
    const { dispose, host } = renderScanList();

    clickButton(host, "apps");

    expect(rowNames(host)).toEqual(["web", "desktop"]);
    expect(host.querySelector('button[aria-current="page"]')?.textContent).toContain("apps");

    clickButton(host, "zpace");

    expect(rowNames(host)).toContain("node_modules");
    expect(host.querySelector('button[aria-current="page"]')?.textContent).toContain("zpace");
    cleanup(dispose, host);
  });

  test("sorts rows from the user controls", () => {
    const { dispose, host } = renderScanList();

    const sortSelect = selectByLabel(host, "Sort");
    sortSelect.value = "name";
    sortSelect.dispatchEvent(new InputEvent("input", { bubbles: true }));

    const directionButton = host.querySelector('button[aria-label="Sort ascending"]');
    directionButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(rowNames(host)).toEqual(["apps", "docs", "node_modules", "package.json"]);
    expect(sortSelect.textContent).toContain("Allocated size");
    expect(sortSelect.textContent).toContain("Type");
    expect(sortSelect.textContent).toContain("Category");
    expect(sortSelect.textContent).toContain("Risk");
    cleanup(dispose, host);
  });

  test("filters rows by category", () => {
    const { dispose, host } = renderScanList();

    const categorySelect = selectByLabel(host, "Category");
    categorySelect.value = "Developer artifacts";
    categorySelect.dispatchEvent(new InputEvent("input", { bubbles: true }));

    expect(rowNames(host)).toEqual(["node_modules"]);
    expect(host.textContent).toContain("Developer artifacts");
    cleanup(dispose, host);
  });

  test("adds and removes rows through queue controls", () => {
    const added: ScanNode[] = [];
    const removed: string[] = [];
    const { dispose, host } = renderScanList({
      queuedPaths: new Set(["/Users/erik/Projects/zpace/node_modules"]),
      onAddToQueue: (node) => added.push(node),
      onRemoveFromQueue: (path) => removed.push(path),
    });

    clickRowQueueButton(host, "package.json");
    clickRowQueueButton(host, "node_modules");

    expect(added.map((node) => node.path)).toEqual(["/Users/erik/Projects/zpace/package.json"]);
    expect(removed).toEqual(["/Users/erik/Projects/zpace/node_modules"]);
    cleanup(dispose, host);
  });
});

function renderScanList(props: Partial<Parameters<typeof ScanList>[0]> = {}) {
  const host = document.createElement("div");
  document.body.append(host);
  const dispose = render(() => <ScanList root={fixtureScanResult.root} {...props} />, host);
  return { dispose, host };
}

function cleanup(dispose: () => void, host: HTMLElement) {
  dispose();
  host.remove();
}

function clickButton(host: HTMLElement, label: string) {
  const button = Array.from(host.querySelectorAll("button")).find(
    (item) => item.textContent?.trim() === label,
  );
  expect(button).toBeDefined();
  button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

function selectByLabel(host: HTMLElement, label: string): HTMLSelectElement {
  const select = Array.from(host.querySelectorAll("label")).find((item) =>
    item.textContent?.includes(label),
  )?.querySelector("select");
  expect(select).toBeDefined();
  return select as HTMLSelectElement;
}

function rowNames(host: HTMLElement): string[] {
  return Array.from(host.querySelectorAll("[data-scan-row]")).map(
    (row) => row.getAttribute("data-scan-row") ?? "",
  );
}

function clickRowQueueButton(host: HTMLElement, rowName: string) {
  const row = host.querySelector(`[data-scan-row="${rowName}"]`);
  expect(row).toBeDefined();
  const button = row?.querySelector("button[aria-pressed]");
  expect(button).toBeDefined();
  button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}
