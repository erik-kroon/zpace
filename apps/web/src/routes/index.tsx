import { createFileRoute } from "@tanstack/solid-router";
import { createMemo, For, Show } from "solid-js";
import { RefreshCw, Square } from "lucide-solid";

import { RadialUsageMap } from "@/components/radial-usage-map";
import { ScanList } from "@/components/scan-list";
import { summarizeScanSnapshot } from "@/lib/scan-presentation";
import { createFixtureScanSession } from "@/scan-session";

export const Route = createFileRoute("/")({
  component: App,
});

function App() {
  const scan = createFixtureScanSession();
  const snapshot = createMemo(() => scan.snapshot());
  const root = createMemo(() => snapshot().result?.root);
  const progress = createMemo(() => snapshot().progress);
  const summary = createMemo(() => summarizeScanSnapshot(snapshot()));

  return (
    <main class="min-h-screen bg-neutral-950 text-neutral-100">
      <section class="border-b border-neutral-800 bg-neutral-900/60">
        <div class="mx-auto flex max-w-5xl flex-col gap-4 px-5 py-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 class="text-2xl font-semibold tracking-normal">zpace scan tracer</h1>
            <p class="mt-2 max-w-2xl text-sm text-neutral-400">
              Native Zig scanner output rendered through the TypeScript app layer.
            </p>
          </div>
          <div class="flex flex-col gap-4 sm:items-end">
            <div class="flex gap-2">
              <button
                type="button"
                class="inline-flex h-9 items-center gap-2 rounded-md border border-neutral-700 px-3 text-sm font-medium text-neutral-100 disabled:cursor-not-allowed disabled:opacity-40"
                disabled={!scan.canRescan()}
                onClick={scan.startRescan}
              >
                <RefreshCw size={16} aria-hidden="true" />
                Re-scan
              </button>
              <button
                type="button"
                class="inline-flex h-9 items-center gap-2 rounded-md border border-red-500/60 px-3 text-sm font-medium text-red-100 disabled:cursor-not-allowed disabled:opacity-40"
                disabled={!scan.canCancel()}
                onClick={scan.cancel}
              >
                <Square size={14} aria-hidden="true" />
                Cancel
              </button>
            </div>
            <dl class="grid grid-cols-2 gap-3 text-right sm:grid-cols-5">
              <For each={summary()}>
                {(item) => (
                  <div>
                    <dt class="text-xs uppercase text-neutral-500">{item.label}</dt>
                    <dd class="mt-1 text-sm font-medium">{item.value}</dd>
                  </div>
                )}
              </For>
            </dl>
          </div>
        </div>
      </section>
      <div class="mx-auto max-w-5xl px-5 py-6">
        <div class="mb-4 h-2 overflow-hidden rounded-full bg-neutral-800">
          <div
            class="h-full bg-emerald-400 transition-all"
            style={{ width: `${Math.min(100, progress().pathsScanned * 25)}%` }}
          />
        </div>
        <Show when={progress().currentPath}>
          {(currentPath) => <p class="mb-4 truncate text-sm text-neutral-400">{currentPath()}</p>}
        </Show>
        <Show when={root()}>
          {(scanRoot) => (
            <div class="space-y-5">
              <RadialUsageMap root={scanRoot()} />
              <ScanList root={scanRoot()} />
            </div>
          )}
        </Show>
      </div>
    </main>
  );
}
