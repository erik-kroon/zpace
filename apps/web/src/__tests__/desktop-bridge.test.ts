import { afterEach, describe, expect, test, vi } from "vitest";

import { createBestAvailableScanSession } from "@/desktop-bridge";
import { initialScanProgress, type ScanLifecycleSnapshot } from "@zpace/scanner/src/schema";

afterEach(() => {
  vi.useRealTimers();
  delete window.__zpaceDesktopRPC;
  delete window.__electrobun;
});

describe("createBestAvailableScanSession", () => {
  test("falls back to fixture mode outside Electrobun", async () => {
    vi.useFakeTimers();
    const runtime = await createBestAvailableScanSession();

    expect(runtime.mode).toBe("fixture");
    expect(runtime.defaultPath).toBe("~");
    expect(runtime.defaultExcludedPaths).toEqual([]);
    expect(runtime.session.snapshot().result?.root.name).toBe("zpace");
  });

  test("uses desktop RPC when it is already available", async () => {
    const listeners: Array<(payload: { snapshot: ScanLifecycleSnapshot }) => void> = [];
    const startScan = vi.fn(async () => {
      listeners.forEach((listener) =>
        listener({
          snapshot: {
            state: "complete",
            progress: { ...initialScanProgress, currentPath: null },
            result: null,
            error: null,
          },
        }),
      );
      return { accepted: true as const };
    });
    const cancelScan = vi.fn(async () => ({ cancelled: true }));

    window.__zpaceDesktopRPC = {
      request: {
        getDefaultScanPath: vi.fn(async () => ({
          path: "/Users/erik/Projects/zpace",
          homePath: "/Users/erik",
          excludedPaths: ["/Users/erik/Library/CloudStorage"],
        })),
        startScan,
        cancelScan,
      },
      addMessageListener(_message, listener) {
        listeners.push(listener);
      },
    };

    const runtime = await createBestAvailableScanSession();
    expect(runtime.mode).toBe("desktop");
    expect(runtime.defaultPath).toBe("/Users/erik/Projects/zpace");
    expect(runtime.homePath).toBe("/Users/erik");
    expect(runtime.defaultExcludedPaths).toEqual(["/Users/erik/Library/CloudStorage"]);

    runtime.session.startRescan("/tmp/zpace", ["/tmp/zpace/.git"]);

    expect(startScan).toHaveBeenCalledWith({
      path: "/tmp/zpace",
      excludedPaths: ["/tmp/zpace/.git"],
      deepScanGenerated: false,
    });
    expect(runtime.session.snapshot().state).toBe("complete");
  });
});
