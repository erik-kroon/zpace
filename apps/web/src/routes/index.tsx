import { createFileRoute } from "@tanstack/solid-router";
import { createMemo, For, Show } from "solid-js";
import { AlertTriangle, RefreshCw, Square } from "lucide-solid";

import { RadialUsageMap } from "@/components/radial-usage-map";
import { ScanList } from "@/components/scan-list";
import {
  createScanReportViewModel,
  createScanWarningRows,
  getIncompleteScanMessage,
  summarizeScanSnapshot,
} from "@/lib/scan-presentation";
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
  const incompleteMessage = createMemo(() => {
    const result = snapshot().result;
    return result ? getIncompleteScanMessage(result) : null;
  });
  const warningRows = createMemo(() => {
    const result = snapshot().result;
    return result ? createScanWarningRows(result) : [];
  });
  const report = createMemo(() => {
    const result = snapshot().result;
    return result ? createScanReportViewModel(result) : null;
  });

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
        <Show when={incompleteMessage()}>
          {(message) => (
            <section class="mb-5 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-amber-50">
              <div class="flex gap-3">
                <AlertTriangle class="mt-0.5 shrink-0 text-amber-300" size={18} aria-hidden="true" />
                <div class="min-w-0">
                  <h2 class="text-sm font-semibold">{message()}</h2>
                  <ul class="mt-3 space-y-2">
                    <For each={warningRows()}>
                      {(warning) => (
                        <li class="min-w-0">
                          <p class="truncate text-sm font-medium">{warning.diagnostic.path}</p>
                          <p class="text-xs text-amber-100/80">{warning.detail}</p>
                        </li>
                      )}
                    </For>
                  </ul>
                </div>
              </div>
            </section>
          )}
        </Show>
        <Show when={root()}>
          {(scanRoot) => (
            <div class="space-y-5">
              <Show when={report()}>
                {(scanReport) => (
                  <section class="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
                    <dl class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                      <For each={scanReport().metrics}>
                        {(metric) => (
                          <div>
                            <dt class="text-xs uppercase text-neutral-500">{metric.label}</dt>
                            <dd class="mt-1 text-sm font-semibold text-neutral-100">{metric.value}</dd>
                          </div>
                        )}
                      </For>
                    </dl>
                    <div class="mt-5 grid gap-5 lg:grid-cols-2">
                      <ReportList title="Largest items" rows={scanReport().largestItems} />
                      <ReportList title="Category breakdown" rows={scanReport().categories} />
                    </div>
                  </section>
                )}
              </Show>
              <RadialUsageMap root={scanRoot()} />
              <ScanList root={scanRoot()} />
            </div>
          )}
        </Show>
      </div>
    </main>
  );
}

function ReportList(props: {
  title: string;
  rows: Array<{ label: string; value: string; detail: string | null }>;
}) {
  return (
    <div>
      <h2 class="text-sm font-semibold text-neutral-100">{props.title}</h2>
      <ul class="mt-3 space-y-2">
        <For each={props.rows}>
          {(row) => (
            <li class="flex min-w-0 items-start justify-between gap-3 border-b border-neutral-800 pb-2 last:border-b-0">
              <div class="min-w-0">
                <p class="truncate text-sm text-neutral-200">{row.label}</p>
                <Show when={row.detail}>
                  {(detail) => <p class="truncate text-xs text-neutral-500">{detail()}</p>}
                </Show>
              </div>
              <span class="shrink-0 text-sm tabular-nums text-neutral-300">{row.value}</span>
            </li>
          )}
        </For>
      </ul>
      <Show when={props.rows.length === 0}>
        <p class="mt-3 text-sm text-neutral-500">No report data available.</p>
      </Show>
    </div>
  );
}
