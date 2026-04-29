import { describe, expect, test } from "vitest";
import { render } from "solid-js/web";

import { ScanList } from "@/components/scan-list";
import { fixtureScanResult } from "@/fixtures/scan-result";

describe("ScanList", () => {
  test("renders scanner fixture rows with size and path", () => {
    const host = document.createElement("div");
    const dispose = render(() => <ScanList root={fixtureScanResult.root} />, host);
    const html = host.textContent ?? "";

    expect(html).toContain("package.json");
    expect(html).toContain("/Users/erik/Projects/zpace/package.json");
    expect(html).toContain("921 B");
    expect(html).toContain("Dependency folder");
    expect(html).toContain("medium");
    expect(html).toContain("Usually recoverable by reinstalling dependencies");
    expect(html).toContain("complete");
    dispose();
  });
});
