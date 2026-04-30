import { createFileRoute } from "@tanstack/solid-router";
import type { ScanNode } from "@zpace/scanner/src/schema";
import { createEffect, createMemo, createResource, createSignal, For, Show } from "solid-js";
import { AlertTriangle, RefreshCw, Square, Trash2, X } from "lucide-solid";

import { RadialUsageMap } from "@/components/radial-usage-map";
import { ScanList } from "@/components/scan-list";
import { createBestAvailableScanSession } from "@/desktop-bridge";
import {
  createScanReportViewModel,
  createScanWarningRows,
  canMoveCleanupQueueToTrash,
  createCleanupExecutionResult,
  createCleanupQueueItem,
  createCleanupQueueSummary,
  type CleanupExecutionResult,
  type CleanupQueueItem,
  getIncompleteScanMessage,
  summarizeScanSnapshot,
} from "@/lib/scan-presentation";
import type { ScanSession } from "@/scan-session";

export const Route = createFileRoute("/")({
  component: App,
});

function App() {
  const [runtime] = createResource(createBestAvailableScanSession);
  const [scanTargetPath, setScanTargetPath] = createSignal("~");
  const [excludedPathsText, setExcludedPathsText] = createSignal("");
  const [deepScanGenerated, setDeepScanGenerated] = createSignal(false);
  const [queueItems, setQueueItems] = createSignal<CleanupQueueItem[]>([]);
  const [cleanupHistory, setCleanupHistory] = createSignal<CleanupExecutionResult[]>([]);
  const [isReviewingCleanup, setIsReviewingCleanup] = createSignal(false);
  const [dryRun, setDryRun] = createSignal(false);
  const scan = createMemo<ScanSession | null>(() => runtime()?.session ?? null);
  createEffect(() => {
    const nextPath = runtime()?.defaultPath;
    if (nextPath) setScanTargetPath(nextPath);
    const defaultExcludedPaths = runtime()?.defaultExcludedPaths;
    if (defaultExcludedPaths && excludedPathsText().trim().length === 0) {
      setExcludedPathsText(defaultExcludedPaths.join("\n"));
    }
  });
  const snapshot = createMemo(() => scan()?.snapshot() ?? null);
  const root = createMemo(() => snapshot()?.result?.root);
  const progress = createMemo(() => snapshot()?.progress ?? null);
  const isScanActive = createMemo(() => {
    const state = snapshot()?.state;
    return state === "starting" || state === "running";
  });
  const scanError = createMemo(() => {
    const currentSnapshot = snapshot();
    return currentSnapshot?.state === "error" ? currentSnapshot.error : null;
  });
  const summary = createMemo(() => {
    const currentSnapshot = snapshot();
    return currentSnapshot ? summarizeScanSnapshot(currentSnapshot) : [];
  });
  const incompleteMessage = createMemo(() => {
    const result = snapshot()?.result;
    return result ? getIncompleteScanMessage(result) : null;
  });
  const warningRows = createMemo(() => {
    const result = snapshot()?.result;
    return result ? createScanWarningRows(result) : [];
  });
  const report = createMemo(() => {
    const result = snapshot()?.result;
    return result ? createScanReportViewModel(result) : null;
  });
  const queuedPaths = createMemo(() => new Set(queueItems().map((item) => item.path)));
  const queueSummary = createMemo(() => createCleanupQueueSummary(queueItems()));
  const isHomeScanTarget = createMemo(() => {
    const homePath = runtime()?.homePath;
    if (!homePath) return false;
    return normalizePath(scanTargetPath()) === normalizePath(homePath);
  });

  const addToQueue = (node: ScanNode) => {
    setQueueItems((items) => {
      if (items.some((item) => item.path === node.path)) return items;
      return [...items, createCleanupQueueItem(node)];
    });
  };

  const removeFromQueue = (path: string) => {
    setQueueItems((items) => items.filter((item) => item.path !== path));
  };

  const excludedPaths = () =>
    excludedPathsText()
      .split("\n")
      .map((path) => path.trim())
      .filter((path) => path.length > 0);

  const startScan = (path = scanTargetPath(), scanGeneratedDeeply = deepScanGenerated()) => {
    setScanTargetPath(path);
    scan()?.startRescan(path, excludedPaths(), scanGeneratedDeeply);
  };

  const confirmCleanup = () => {
    const items = queueItems();
    if (items.length === 0) return;
    if (!dryRun() && !canMoveCleanupQueueToTrash(items)) return;

    const result = createCleanupExecutionResult(items, {
      dryRun: dryRun(),
      trashAvailable: false,
    });
    setCleanupHistory((history) => [result, ...history]);
    setIsReviewingCleanup(false);

    if (!result.dryRun) {
      const completedPaths = new Set(
        result.results
          .filter((item) => item.status === "moved")
          .map((item) => item.path),
      );
      setQueueItems((currentItems) => currentItems.filter((item) => !completedPaths.has(item.path)));
    }
  };

  return (
    <main class="min-h-screen bg-neutral-950 text-neutral-100">
      <section class="border-b border-neutral-800 bg-neutral-900/70">
        <div class="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6 lg:flex-row lg:items-end lg:justify-between">
          <div class="min-w-0">
            <p class="text-xs font-medium uppercase text-emerald-300">Disk scanner</p>
            <h1 class="mt-2 text-2xl font-semibold tracking-normal">zpace scan tracer</h1>
            <p class="mt-2 max-w-2xl text-sm text-neutral-400">
              Native Zig scanner output rendered through the TypeScript app layer.
            </p>
          </div>
          <div class="flex flex-col gap-4 lg:items-end">
            <div class="flex gap-2">
              <button
                type="button"
                class="inline-flex h-9 items-center gap-2 rounded-md border border-emerald-500/60 px-3 text-sm font-medium text-emerald-100 hover:bg-emerald-500/10 disabled:cursor-not-allowed disabled:opacity-40"
                disabled={!scan()?.canRescan()}
                onClick={() => startScan()}
              >
                <RefreshCw size={16} aria-hidden="true" />
                Re-scan
              </button>
              <button
                type="button"
                class="inline-flex h-9 items-center gap-2 rounded-md border border-red-500/50 px-3 text-sm font-medium text-red-100 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-40"
                disabled={!scan()?.canCancel()}
                onClick={() => scan()?.cancel()}
              >
                <Square size={14} aria-hidden="true" />
                Cancel
              </button>
            </div>
            <dl class="grid grid-cols-2 gap-3 sm:grid-cols-5 lg:text-right">
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
      <div class="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <section class="mb-5 rounded-lg border border-neutral-800 bg-neutral-900 p-4">
          <div class="flex flex-col gap-3 md:flex-row md:items-end">
            <label class="min-w-0 flex-1 text-sm text-neutral-400">
              Scan path
              <input
                class="mt-1 h-10 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 text-sm text-neutral-100"
                value={scanTargetPath()}
                disabled={!scan()?.canRescan()}
                onInput={(event) => setScanTargetPath(event.currentTarget.value)}
              />
            </label>
            <button
              type="button"
              class="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-emerald-500/60 px-4 text-sm font-medium text-emerald-100 hover:bg-emerald-500/10 disabled:cursor-not-allowed disabled:opacity-40 md:min-w-28"
              disabled={!scan()?.canRescan()}
              onClick={() => startScan()}
            >
              <RefreshCw size={16} aria-hidden="true" />
              Scan
            </button>
          </div>
          <p class="mt-2 text-xs text-neutral-500">
            {runtime()?.mode === "desktop"
              ? "Desktop mode: scans run through the native Zig scanner."
              : "Browser preview: scans use fixture data. Run the desktop app for local disk scans."}
          </p>
          <label class="mt-4 block text-sm text-neutral-400">
            Excluded paths
            <textarea
              class="mt-1 min-h-24 w-full resize-y rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 font-mono text-xs text-neutral-100"
              value={excludedPathsText()}
              disabled={!scan()?.canRescan()}
              onInput={(event) => setExcludedPathsText(event.currentTarget.value)}
              spellcheck={false}
            />
          </label>
          <p class="mt-2 text-xs text-neutral-500">
            One path per line. Excluded paths are reported as skipped and can be scanned directly later.
          </p>
          <label class="mt-3 flex items-start gap-2 text-sm text-neutral-300">
            <input
              type="checkbox"
              class="mt-0.5 size-4 accent-emerald-400"
              checked={deepScanGenerated()}
              disabled={!scan()?.canRescan()}
              onChange={(event) => setDeepScanGenerated(event.currentTarget.checked)}
            />
            <span>
              Deep scan generated folders
              <span class="block text-xs text-neutral-500">
                Exact dependency folder sizes and descendant counts; slower on large package trees.
              </span>
            </span>
          </label>
          <Show when={isHomeScanTarget()}>
            <p class="mt-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
              Home-folder scans can touch millions of files. Default excludes skip cloud mirrors and Spotlight metadata; remove paths here if you need them included.
            </p>
          </Show>
        </section>
        <div
          class="mb-4 h-2 overflow-hidden rounded-full bg-neutral-800"
          role="progressbar"
          aria-busy={isScanActive()}
        >
          <Show
            when={isScanActive()}
            fallback={
              <div
                class="h-full rounded-full bg-emerald-400 transition-all"
                style={{ width: snapshot()?.state === "complete" ? "100%" : "0%" }}
              />
            }
          >
            <div class="zpace-progress-indeterminate h-full rounded-full bg-emerald-400" />
          </Show>
        </div>
        <Show when={progress()?.currentPath}>
          {(currentPath) => <p class="mb-4 truncate text-sm text-neutral-400">{currentPath()}</p>}
        </Show>
        <Show when={scanError()}>
          {(error) => (
            <section class="mb-5 rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-red-50">
              <div class="flex gap-3">
                <AlertTriangle class="mt-0.5 shrink-0 text-red-300" size={18} aria-hidden="true" />
                <div class="min-w-0">
                  <h2 class="text-sm font-semibold">Scan failed</h2>
                  <p class="mt-2 break-words text-sm text-red-100/90">{error()}</p>
                  <p class="mt-2 break-all text-xs text-red-100/70">Path: {scanTargetPath()}</p>
                </div>
              </div>
            </section>
          )}
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
              <CleanupQueue
                summary={queueSummary()}
                onRemove={removeFromQueue}
                onClear={() => setQueueItems([])}
                onReview={() => setIsReviewingCleanup(true)}
              />
              <Show when={isReviewingCleanup()}>
                <CleanupReview
                  summary={queueSummary()}
                  dryRun={dryRun()}
                  onDryRunChange={setDryRun}
                  onCancel={() => setIsReviewingCleanup(false)}
                  onConfirm={confirmCleanup}
                />
              </Show>
              <CleanupHistory
                history={cleanupHistory()}
                canRescan={scan()?.canRescan() ?? false}
                onRescan={() => startScan()}
              />
              <ScanList
                root={scanRoot()}
                queuedPaths={queuedPaths()}
                onAddToQueue={addToQueue}
                onRemoveFromQueue={removeFromQueue}
                onDeepScan={(path) => startScan(path, true)}
              />
            </div>
          )}
        </Show>
      </div>
    </main>
  );
}

function normalizePath(path: string): string {
  return path.trim().replace(/\/+$/, "");
}

function CleanupQueue(props: {
  summary: ReturnType<typeof createCleanupQueueSummary>;
  onRemove: (path: string) => void;
  onClear: () => void;
  onReview: () => void;
}) {
  const isEmpty = () => props.summary.items.length === 0;

  return (
    <section class="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
      <div class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 class="text-sm font-semibold text-neutral-100">Cleanup queue</h2>
          <p class="mt-1 text-sm text-neutral-500">
            {props.summary.itemCountLabel} selected, {props.summary.totalSizeLabel} total.
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            class="inline-flex h-9 items-center gap-2 rounded-md border border-neutral-700 px-3 text-sm font-medium text-neutral-100 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={isEmpty()}
            onClick={props.onClear}
          >
            <X size={15} aria-hidden="true" />
            Clear
          </button>
          <button
            type="button"
            class="inline-flex h-9 items-center gap-2 rounded-md border border-emerald-500/60 px-3 text-sm font-medium text-emerald-100 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={isEmpty()}
            onClick={props.onReview}
          >
            <Trash2 size={15} aria-hidden="true" />
            Review cleanup
          </button>
        </div>
      </div>
      <Show when={props.summary.warning}>
        {(warning) => (
          <p class="mt-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
            {warning()}
          </p>
        )}
      </Show>
      <Show
        when={!isEmpty()}
        fallback={<p class="mt-4 text-sm text-neutral-500">Add items from the scan list before reviewing cleanup.</p>}
      >
        <ul class="mt-4 divide-y divide-neutral-800">
          <For each={props.summary.items}>
            {(item) => (
              <li class="flex min-w-0 items-start justify-between gap-3 py-3">
                <div class="min-w-0">
                  <div class="flex min-w-0 flex-wrap items-center gap-2">
                    <p class="truncate text-sm font-medium text-neutral-100">{item.name}</p>
                    <span class="rounded-md border border-neutral-700 px-1.5 py-0.5 text-[11px] text-neutral-300">
                      {item.category}
                    </span>
                    <Show when={item.risk}>
                      {(risk) => (
                        <span class="rounded-md border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[11px] text-amber-200">
                          {risk()}
                        </span>
                      )}
                    </Show>
                    <Show when={item.isProtected}>
                      <span class="rounded-md border border-red-500/40 bg-red-500/10 px-1.5 py-0.5 text-[11px] text-red-200">
                        protected
                      </span>
                    </Show>
                  </div>
                  <p class="mt-1 truncate text-xs text-neutral-500">{item.path}</p>
                  <Show when={item.recommendation}>
                    {(recommendation) => (
                      <p class="mt-1 line-clamp-2 text-xs text-neutral-500">{recommendation()}</p>
                    )}
                  </Show>
                </div>
                <div class="shrink-0 text-right">
                  <p class="text-sm tabular-nums text-neutral-300">{item.sizeLabel}</p>
                  <button
                    type="button"
                    class="mt-2 inline-flex h-8 items-center justify-center rounded-md border border-neutral-700 px-2 text-xs text-neutral-300 hover:bg-neutral-800 hover:text-neutral-100"
                    onClick={() => props.onRemove(item.path)}
                  >
                    Remove
                  </button>
                </div>
              </li>
            )}
          </For>
        </ul>
      </Show>
    </section>
  );
}

function CleanupReview(props: {
  summary: ReturnType<typeof createCleanupQueueSummary>;
  dryRun: boolean;
  onDryRunChange: (dryRun: boolean) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const hasProtectedItems = () => props.summary.items.some((item) => item.isProtected);
  const canConfirm = () => props.summary.items.length > 0 && (props.dryRun || !hasProtectedItems());

  return (
    <section class="rounded-lg border border-emerald-500/40 bg-neutral-900 p-4">
      <div class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 class="text-sm font-semibold text-neutral-100">Review cleanup</h2>
          <p class="mt-1 text-sm text-neutral-500">
            Move {props.summary.itemCountLabel} ({props.summary.totalSizeLabel}) to Trash.
          </p>
        </div>
        <label class="flex items-center gap-2 text-sm text-neutral-300">
          <input
            type="checkbox"
            class="size-4 accent-emerald-400"
            checked={props.dryRun}
            onInput={(event) => props.onDryRunChange(event.currentTarget.checked)}
          />
          Dry run
        </label>
      </div>
      <Show when={hasProtectedItems()}>
        <p class="mt-3 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-100">
          Protected items must be removed from the queue before moving items to Trash. Dry run remains available.
        </p>
      </Show>
      <ul class="mt-4 max-h-80 divide-y divide-neutral-800 overflow-auto rounded-md border border-neutral-800">
        <For each={props.summary.items}>
          {(item) => (
            <li class="grid gap-3 px-3 py-3 md:grid-cols-[minmax(0,1fr)_7rem_8rem]">
              <div class="min-w-0">
                <p class="truncate text-sm font-medium text-neutral-100">{item.name}</p>
                <p class="mt-1 break-all text-xs text-neutral-500">{item.path}</p>
                <Show when={item.protectionReason}>
                  {(reason) => <p class="mt-1 text-xs text-red-200">{reason()}</p>}
                </Show>
              </div>
              <span class="text-sm tabular-nums text-neutral-300 md:text-right">{item.sizeLabel}</span>
              <span class={`h-fit rounded-md border px-2 py-1 text-xs ${item.isProtected ? "border-red-500/40 bg-red-500/10 text-red-200" : "border-neutral-700 text-neutral-300"}`}>
                {item.isProtected ? "protected" : item.risk ?? "unclassified"}
              </span>
            </li>
          )}
        </For>
      </ul>
      <div class="mt-4 flex flex-wrap justify-end gap-2">
        <button
          type="button"
          class="inline-flex h-9 items-center rounded-md border border-neutral-700 px-3 text-sm font-medium text-neutral-100"
          onClick={props.onCancel}
        >
          Cancel
        </button>
        <button
          type="button"
          class="inline-flex h-9 items-center gap-2 rounded-md border border-emerald-500/60 px-3 text-sm font-medium text-emerald-100 disabled:cursor-not-allowed disabled:opacity-40"
          disabled={!canConfirm()}
          onClick={props.onConfirm}
        >
          <Trash2 size={15} aria-hidden="true" />
          {props.dryRun ? "Run dry run" : "Move to Trash"}
        </button>
      </div>
    </section>
  );
}

function CleanupHistory(props: {
  history: CleanupExecutionResult[];
  canRescan: boolean;
  onRescan: () => void;
}) {
  return (
    <Show when={props.history.length > 0}>
      <section class="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
        <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <h2 class="text-sm font-semibold text-neutral-100">Cleanup history</h2>
          <button
            type="button"
            class="inline-flex h-9 items-center gap-2 rounded-md border border-neutral-700 px-3 text-sm font-medium text-neutral-100 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={!props.canRescan}
            onClick={props.onRescan}
          >
            <RefreshCw size={15} aria-hidden="true" />
            Re-scan
          </button>
        </div>
        <ul class="mt-4 space-y-3">
          <For each={props.history}>
            {(entry) => (
              <li class="rounded-md border border-neutral-800 p-3">
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <p class="text-sm font-medium text-neutral-100">
                    {entry.itemCountLabel}, {entry.totalSizeLabel}
                  </p>
                  <span class="rounded-md border border-neutral-700 px-2 py-1 text-xs text-neutral-300">
                    {entry.status}
                  </span>
                </div>
                <p class="mt-1 text-xs text-neutral-500">
                  {new Date(entry.completedAt).toLocaleString()}
                </p>
                <ul class="mt-3 space-y-2">
                  <For each={entry.results}>
                    {(result) => (
                      <li class="grid gap-2 text-sm md:grid-cols-[minmax(0,1fr)_7rem_8rem]">
                        <span class="min-w-0 truncate text-neutral-300">{result.path}</span>
                        <span class="tabular-nums text-neutral-500 md:text-right">{result.sizeLabel}</span>
                        <span class="text-neutral-500">{result.status}</span>
                        <span class="text-xs text-neutral-500 md:col-span-3">{result.message}</span>
                      </li>
                    )}
                  </For>
                </ul>
              </li>
            )}
          </For>
        </ul>
      </section>
    </Show>
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
