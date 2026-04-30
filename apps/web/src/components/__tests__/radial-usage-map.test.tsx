import { describe, expect, test } from "vitest";
import { render } from "solid-js/web";
import { createSignal } from "solid-js";
import type { ScanNode } from "@zpace/scanner/src/schema";

import { RadialUsageMap } from "@/components/radial-usage-map";
import { fixtureScanResult } from "@/fixtures/scan-result";

describe("RadialUsageMap", () => {
  test("renders non-empty scan data with current folder total", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const dispose = render(() => <RadialUsageMap root={fixtureScanResult.root} viewPath={fixtureScanResult.root.path} />, host);

    expect(host.querySelectorAll("path").length).toBeGreaterThan(0);
    expect(host.textContent).toContain("zpace");
    expect(host.textContent).toContain("321 KB");
    expect(host.textContent).toContain("apps");

    dispose();
    host.remove();
  });

  test("clicking a folder segment drills in and syncs breadcrumbs", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const dispose = render(() => {
      const [viewPath, setViewPath] = createSignal(fixtureScanResult.root.path);
      return (
        <RadialUsageMap
          root={fixtureScanResult.root}
          viewPath={viewPath()}
          onViewChange={(node) => setViewPath(node.path)}
        />
      );
    }, host);
    const appsSegment = host.querySelector('path[aria-label^="apps,"]');

    expect(appsSegment).not.toBeNull();
    appsSegment?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(host.textContent).toContain("178 KB");
    expect(host.textContent).toContain("web");
    expect(host.textContent).toContain("desktop");
    expect(host.querySelector('button[aria-current="page"]')?.textContent).toContain("apps");

    dispose();
    host.remove();
  });

  test("renders partial native scan nodes without crashing", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const partialRoot = {
      path: "/Users/erik",
      name: "erik",
      type: "directory",
      logicalSize: 1024,
      children: [
        {
          name: "partial-child",
          type: "directory",
          logicalSize: 512,
        },
      ],
    } as ScanNode;

    const dispose = render(() => <RadialUsageMap root={partialRoot} viewPath={partialRoot.path} />, host);

    expect(host.textContent).toContain("erik");
    expect(host.textContent).toContain("partial-child");

    dispose();
    host.remove();
  });
});
