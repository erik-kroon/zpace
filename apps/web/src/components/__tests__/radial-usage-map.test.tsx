import { describe, expect, test } from "vitest";
import { render } from "solid-js/web";

import { RadialUsageMap } from "@/components/radial-usage-map";
import { fixtureScanResult } from "@/fixtures/scan-result";

describe("RadialUsageMap", () => {
  test("renders non-empty scan data with current folder total", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const dispose = render(() => <RadialUsageMap root={fixtureScanResult.root} />, host);

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
    const dispose = render(() => <RadialUsageMap root={fixtureScanResult.root} />, host);
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
});
