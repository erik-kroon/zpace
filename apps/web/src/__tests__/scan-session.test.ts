import { describe, expect, test, vi } from "vitest";

import { createFixtureScanSession } from "@/scan-session";

describe("createFixtureScanSession", () => {
  test("cancels an active scan", () => {
    vi.useFakeTimers();
    const session = createFixtureScanSession();

    session.startRescan();
    expect(session.canCancel()).toBe(true);

    session.cancel();
    expect(session.snapshot().state).toBe("cancelled");
    expect(session.snapshot().progress.currentPath).toBeNull();
    expect(session.canRescan()).toBe(true);
    vi.useRealTimers();
  });

  test("supports re-scan after a completed scan", () => {
    vi.useFakeTimers();
    const session = createFixtureScanSession();

    expect(session.snapshot().state).toBe("complete");
    session.startRescan();
    expect(session.snapshot().state).toBe("running");

    vi.advanceTimersByTime(900);
    expect(session.snapshot().state).toBe("complete");
    expect(session.snapshot().result?.root.name).toBe("zpace");
    vi.useRealTimers();
  });
});
