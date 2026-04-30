import { createFileRoute } from "@tanstack/solid-router";
import type { ScanNode } from "@zpace/scanner/src/schema";
import { createEffect, createMemo, createResource, createSignal, For, Show } from "solid-js";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  File,
  Folder,
  FolderOpen,
  Home,
  RefreshCw,
  Search,
  Settings,
  Square,
  Trash2,
  X,
} from "lucide-solid";

import { getRadialNodeColor, RadialUsageMap } from "@/components/radial-usage-map";
import { createBestAvailableScanSession } from "@/desktop-bridge";
import {
  createScanReportViewModel,
  createScanWarningRows,
  canMoveCleanupQueueToTrash,
  createCleanupExecutionResult,
  createCleanupQueueItem,
  createCleanupQueueSummary,
  collectScopedCleanupTargets,
  formatBytes,
  formatRiskLabel,
  getScanNodeChildren,
  getScanNodeName,
  getScanNodePath,
  getScanNodeSize,
  type CleanupExecutionResult,
  type CleanupQueueItem,
  type ScanSearchResult,
  getIncompleteScanMessage,
  searchScanNodes,
  summarizeScanSnapshot,
} from "@/lib/scan-presentation";
import type { ScanSession } from "@/scan-session";

export const Route = createFileRoute("/")({
  component: App,
});

type CleanupMode = "closed" | "targets" | "queue" | "review" | "complete";

function App() {
  const [runtime] = createResource(createBestAvailableScanSession);
  const [scanTargetPath, setScanTargetPath] = createSignal("~");
  const [excludedPathsText, setExcludedPathsText] = createSignal("");
  const [deepScanGenerated, setDeepScanGenerated] = createSignal(false);
  const [queueItems, setQueueItems] = createSignal<CleanupQueueItem[]>([]);
  const [cleanupHistory, setCleanupHistory] = createSignal<CleanupExecutionResult[]>([]);
  const [cleanupMode, setCleanupMode] = createSignal<CleanupMode>("closed");
  const [advancedOpen, setAdvancedOpen] = createSignal(false);
  const [viewPath, setViewPath] = createSignal<string | null>(null);
  const [selectedNode, setSelectedNode] = createSignal<ScanNode | null>(null);
  const [highlightedNode, setHighlightedNode] = createSignal<ScanNode | null>(null);
  const [searchText, setSearchText] = createSignal("");
  const [activeSearchIndex, setActiveSearchIndex] = createSignal(0);
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
  const nodeLookup = createMemo(() => {
    const currentRoot = root();
    return currentRoot ? buildNodeLookup(currentRoot) : new Map<string, ScanNode>();
  });
  const viewNode = createMemo(() => {
    const currentRoot = root();
    if (!currentRoot) return null;
    return nodeLookup().get(viewPath() ?? getScanNodePath(currentRoot)) ?? currentRoot;
  });
  const selectedItem = createMemo(() => {
    const selectedPath = selectedNode() ? getScanNodePath(selectedNode()) : null;
    if (!selectedPath) return null;
    return nodeLookup().get(selectedPath) ?? null;
  });
  const inspectedNode = createMemo(() => selectedItem() ?? viewNode());
  const parentScanPath = createMemo(() => getParentPath(getScanNodePath(root())));
  const topChildren = createMemo(() =>
    [...getScanNodeChildren(viewNode())].sort((left, right) => getScanNodeSize(right) - getScanNodeSize(left)).slice(0, 6),
  );
  const reclaimableItems = createMemo(() =>
    collectScopedCleanupTargets(viewNode()).sort((left, right) => getScanNodeSize(right) - getScanNodeSize(left)).slice(0, 5),
  );
  const globalReclaimableItems = createMemo(() =>
    collectScopedCleanupTargets(root()).sort((left, right) => getScanNodeSize(right) - getScanNodeSize(left)),
  );
  const searchResults = createMemo(() => searchScanNodes(root(), searchText(), 10));
  const queuedPaths = createMemo(() => new Set(queueItems().map((item) => item.path)));
  const queueSummary = createMemo(() => createCleanupQueueSummary(queueItems()));
  const latestCleanupResult = createMemo(() => cleanupHistory()[0] ?? null);
  const headerMode = createMemo<"home" | "scanning" | "explore">(() => {
    if (isScanActive()) return "scanning";
    return root() ? "explore" : "home";
  });
  const isHomeScanTarget = createMemo(() => {
    const homePath = runtime()?.homePath;
    if (!homePath) return false;
    return normalizePath(scanTargetPath()) === normalizePath(homePath);
  });

  const addToQueue = (node: ScanNode, revealQueue = true) => {
    setQueueItems((items) => {
      if (items.some((item) => item.path === getScanNodePath(node))) return items;
      if (revealQueue) setCleanupMode("queue");
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
    setViewPath(null);
    setSelectedNode(null);
    setHighlightedNode(null);
    scan()?.startRescan(path, excludedPaths(), scanGeneratedDeeply);
  };

  const scanHomeFolder = () => {
    startScan(runtime()?.homePath ?? scanTargetPath());
  };

  const chooseFolderAndScan = async () => {
    const selectedPath = await runtime()?.chooseScanFolder();
    if (!selectedPath) return;
    startScan(selectedPath);
  };

  const changeViewNode = (node: ScanNode) => {
    setViewPath(getScanNodePath(node));
    setSelectedNode(null);
    setHighlightedNode(null);
  };

  const selectSearchResult = (node: ScanNode) => {
    setSelectedNode(node);
    setHighlightedNode(node);
    setSearchText("");
    setActiveSearchIndex(0);
  };

  const updateSearchText = (value: string) => {
    setSearchText(value);
    setActiveSearchIndex(0);
  };

  const moveActiveSearchResult = (direction: 1 | -1) => {
    const resultCount = searchResults().length;
    if (resultCount === 0) return;
    setActiveSearchIndex((index) => (index + direction + resultCount) % resultCount);
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
    setCleanupMode("complete");

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
    <main class="relative flex h-screen flex-col overflow-hidden bg-[#101827] text-slate-100">
      <AppHeader
        mode={headerMode()}
        root={root() ?? null}
        view={viewNode()}
        searchText={searchText()}
        canCancel={scan()?.canCancel() ?? false}
        canRescan={scan()?.canRescan() ?? false}
        onSearchChange={updateSearchText}
        onSearchSubmit={() => {
          const result = searchResults()[activeSearchIndex()] ?? searchResults()[0];
          if (result) selectSearchResult(result.node);
        }}
        onClearSearch={() => {
          setSearchText("");
          setActiveSearchIndex(0);
        }}
        onSearchMove={moveActiveSearchResult}
        onCancel={() => scan()?.cancel()}
        onRescan={() => startScan()}
        onChooseFolder={chooseFolderAndScan}
        onToggleSettings={() => setAdvancedOpen(!advancedOpen())}
        scanTargetPath={scanTargetPath()}
      />
      <Show when={headerMode() === "explore" && searchText().trim().length > 0}>
        <SearchResultsPanel
          query={searchText()}
          results={searchResults()}
          activeIndex={activeSearchIndex()}
          onActiveIndexChange={setActiveSearchIndex}
          onSelect={selectSearchResult}
          onClose={() => {
            setSearchText("");
            setActiveSearchIndex(0);
          }}
        />
      </Show>
      <div class={`min-h-0 flex-1 overflow-hidden px-4 pt-4 ${cleanupMode() === "targets" || cleanupMode() === "queue" ? "pb-24" : "pb-4"}`}>
        <Show when={advancedOpen()}>
          <section class="mb-5 rounded-lg border border-white/10 bg-[#172033] p-4">
            <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
              <label class="block text-sm text-slate-300">
                Excluded paths
                <textarea class="mt-1 min-h-24 w-full resize-y rounded-md border border-white/10 bg-[#101827] px-3 py-2 font-mono text-xs text-slate-100" value={excludedPathsText()} disabled={!scan()?.canRescan()} onInput={(event) => setExcludedPathsText(event.currentTarget.value)} spellcheck={false} />
              </label>
              <div class="space-y-3">
                <label class="flex items-start gap-2 text-sm text-slate-300">
                  <input type="checkbox" class="mt-0.5 size-4 accent-cyan-300" checked={deepScanGenerated()} disabled={!scan()?.canRescan()} onChange={(event) => setDeepScanGenerated(event.currentTarget.checked)} />
                  <span>
                    Deep scan generated folders
                    <span class="block text-xs text-slate-500">Slower, but more exact for dependency folders.</span>
                  </span>
                </label>
                <p class="text-xs text-slate-500">{runtime()?.mode === "desktop" ? "Desktop scans use the local scanner." : "Browser preview uses fixture data."}</p>
              </div>
            </div>
          </section>
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
        <Show when={!root() && !isScanActive() && !scanError()}>
          <HomeScreen
            scanTargetPath={scanTargetPath()}
            canScan={scan()?.canRescan() ?? false}
            deepScanGenerated={deepScanGenerated()}
            excludedPathCount={excludedPaths().length}
            isHomeScanTarget={isHomeScanTarget()}
            onPathChange={setScanTargetPath}
            onScan={() => startScan()}
            onScanHome={scanHomeFolder}
            onChooseFolder={chooseFolderAndScan}
            onScanPath={(path) => startScan(path)}
            onToggleAdvanced={() => setAdvancedOpen(!advancedOpen())}
          />
        </Show>
        <Show when={isScanActive()}>
          <ScanningScreen
            scanTargetPath={scanTargetPath()}
            root={root() ?? null}
            viewPath={viewNode() ? getScanNodePath(viewNode()) : root() ? getScanNodePath(root()) : null}
            progress={progress()}
            summary={summary()}
            currentPath={progress()?.currentPath ?? null}
            warningCount={warningRows().length}
            largestItems={report()?.largestItems ?? []}
            onSelect={setSelectedNode}
            onHighlight={setHighlightedNode}
            onViewChange={changeViewNode}
          />
        </Show>
        <Show when={!isScanActive() && root()}>
          {(scanRoot) => (
            <Show
              when={cleanupMode() === "review"}
              fallback={
                <Show
                  when={cleanupMode() === "complete" && latestCleanupResult()}
                  fallback={
                    <div class="grid h-full min-h-0 gap-3">
                      <section class="grid min-h-0 min-w-0 gap-4 lg:grid-cols-[minmax(0,2.1fr)_minmax(300px,0.9fr)]">
                        <RadialUsageMap
                          root={scanRoot()}
                          viewPath={viewNode() ? getScanNodePath(viewNode()) : getScanNodePath(scanRoot())}
                          selectedPath={selectedItem() ? getScanNodePath(selectedItem()) : null}
                          highlightedPath={highlightedNode() ? getScanNodePath(highlightedNode()) : null}
                          onSelect={setSelectedNode}
                          onHighlight={setHighlightedNode}
                          onViewChange={changeViewNode}
                        />
                        <InspectorPanel
                          root={scanRoot()}
                          view={viewNode() ?? scanRoot()}
                          selected={inspectedNode()}
                          topChildren={topChildren()}
                          reclaimableItems={reclaimableItems()}
                          globalReclaimableCount={globalReclaimableItems().length}
                          metrics={report()?.metrics ?? summary()}
                          queuedPaths={queuedPaths()}
                          scanRootPath={scanTargetPath()}
                          parentScanPath={parentScanPath()}
                          onSelect={setSelectedNode}
                          onHighlight={setHighlightedNode}
                          onAddToQueue={addToQueue}
                          onRemoveFromQueue={removeFromQueue}
                          onScanPath={(path) => startScan(path)}
                          onViewTargets={() => setCleanupMode("targets")}
                        />
                      </section>
                    </div>
                  }
                >
                  {(result) => (
                    <CleanupComplete
                      result={result()}
                      canRescan={scan()?.canRescan() ?? false}
                      onBackToMap={() => setCleanupMode(queueItems().length > 0 ? "queue" : "closed")}
                      onRescan={() => {
                        setCleanupMode("closed");
                        startScan();
                      }}
                    />
                  )}
                </Show>
              }
            >
              <CleanupReview
                  summary={queueSummary()}
                  dryRun={dryRun()}
                  onDryRunChange={setDryRun}
                  onCancel={() => setCleanupMode("queue")}
                  onConfirm={confirmCleanup}
                />
            </Show>
          )}
        </Show>
      </div>
      <Show when={cleanupMode() === "targets"}>
        <CleanupTargets
          items={reclaimableItems()}
          view={viewNode()}
          queuedPaths={queuedPaths()}
          onCollect={(node) => addToQueue(node, false)}
          onClose={() => setCleanupMode(queueItems().length > 0 ? "queue" : "closed")}
          onReviewQueue={() => setCleanupMode("queue")}
        />
      </Show>
      <Show when={cleanupMode() === "queue"}>
        <CleanupQueue
          summary={queueSummary()}
          onRemove={removeFromQueue}
          onClear={() => {
            setQueueItems([]);
            setCleanupMode("closed");
          }}
          onClose={() => setCleanupMode("closed")}
          onReview={() => setCleanupMode("review")}
        />
      </Show>
    </main>
  );
}

function normalizePath(path: string): string {
  return path.trim().replace(/\/+$/, "");
}

function getParentPath(path: string | null | undefined): string | null {
  if (!path) return null;
  const normalized = normalizePath(path);
  if (!normalized || normalized === "/" || normalized === "~") return null;
  const lastSlash = normalized.lastIndexOf("/");
  if (lastSlash <= 0) return "/";
  return normalized.slice(0, lastSlash);
}

function AppHeader(props: {
  mode: "home" | "scanning" | "explore";
  root: ScanNode | null;
  view: ScanNode | null;
  searchText: string;
  canCancel: boolean;
  canRescan: boolean;
  onSearchChange: (value: string) => void;
  onSearchSubmit: () => void;
  onClearSearch: () => void;
  onSearchMove: (direction: 1 | -1) => void;
  onCancel: () => void;
  onRescan: () => void;
  onChooseFolder: () => void;
  onToggleSettings: () => void;
  scanTargetPath: string;
}) {
  return (
    <header class="relative grid h-[42px] shrink-0 grid-cols-[88px_minmax(0,auto)_minmax(1rem,1fr)_auto] items-center border-b border-white/[0.075] bg-[#101827]/90 pr-3 backdrop-blur-xl">
      <div aria-hidden="true" />
      <div class="electrobun-webkit-app-region-drag flex h-full min-w-0 items-center gap-4">
        <span class="shrink-0 text-xs font-semibold text-slate-100">zpace</span>
        <Show when={props.mode === "explore" && (props.view ?? props.root)}>
          {(node) => <BreadcrumbPath path={getScanNodePath(node())} fallbackName={getScanNodeName(node())} />}
        </Show>
        <Show when={props.mode === "scanning"}>
          <p class="min-w-0 truncate text-xs text-slate-300">Scanning {props.scanTargetPath}</p>
        </Show>
      </div>
      <div aria-hidden="true" class="electrobun-webkit-app-region-drag h-full min-w-4" />
      <div class="flex min-w-0 items-center justify-end gap-1.5">
        <Show when={props.mode === "explore"}>
          <label class="relative hidden min-w-0 sm:block sm:w-[248px]">
            <Search class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" size={14} aria-hidden="true" />
            <input
              class="h-7 w-full rounded-md border-0 bg-white/[0.03] pl-8 pr-2.5 text-xs text-slate-100 outline-none placeholder:text-slate-500 focus:bg-white/[0.06] focus:ring-1 focus:ring-cyan-300/35"
              value={props.searchText}
              onInput={(event) => props.onSearchChange(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  props.onSearchSubmit();
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  props.onClearSearch();
                }
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  props.onSearchMove(1);
                }
                if (event.key === "ArrowUp") {
                  event.preventDefault();
                  props.onSearchMove(-1);
                }
              }}
              placeholder="Search items..."
              aria-label="Search scanned items"
            />
          </label>
          <button type="button" class="inline-flex h-7 items-center justify-center gap-1.5 rounded-md border-0 bg-cyan-300/[0.10] px-2.5 text-xs font-medium text-cyan-50 hover:bg-cyan-300/15 disabled:cursor-not-allowed disabled:opacity-40" disabled={!props.canRescan} onClick={props.onRescan}>
            <RefreshCw size={13} aria-hidden="true" />
            Rescan
          </button>
          <button type="button" class="inline-flex h-7 items-center justify-center gap-1.5 rounded-md border-0 bg-transparent px-2 text-xs font-medium text-slate-300 hover:bg-white/[0.055] hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-40" disabled={!props.canRescan} onClick={props.onChooseFolder}>
            <FolderOpen size={13} aria-hidden="true" />
            Scan folder
          </button>
        </Show>
        <Show when={props.mode === "scanning"}>
          <button type="button" class="inline-flex h-7 items-center justify-center gap-1.5 rounded-md border-0 bg-red-300/[0.08] px-2.5 text-xs font-medium text-red-100 hover:bg-red-300/12 disabled:cursor-not-allowed disabled:opacity-40" disabled={!props.canCancel} onClick={props.onCancel}>
            <Square size={12} aria-hidden="true" />
            Stop scan
          </button>
        </Show>
        <button type="button" class="inline-flex size-7 items-center justify-center rounded-md border-0 bg-white/[0.035] text-slate-300 hover:bg-white/[0.075]" aria-label="Settings" onClick={props.onToggleSettings}>
          <Settings size={14} aria-hidden="true" />
        </button>
      </div>
      <Show when={props.mode === "scanning"}>
        <div class="absolute inset-x-0 bottom-0 h-0.5 overflow-hidden bg-white/10" role="progressbar" aria-busy="true">
          <div class="zpace-progress-indeterminate h-full rounded-full bg-cyan-300" />
        </div>
      </Show>
    </header>
  );
}

function SearchResultsPanel(props: {
  query: string;
  results: ScanSearchResult[];
  activeIndex: number;
  onActiveIndexChange: (index: number) => void;
  onSelect: (node: ScanNode) => void;
  onClose: () => void;
}) {
  return (
    <section class="electrobun-webkit-app-region-no-drag absolute right-4 top-[3.75rem] z-40 w-[min(34rem,calc(100vw-2rem))] overflow-hidden rounded-lg border border-white/10 bg-[#172033] shadow-2xl shadow-black/40" aria-label="Search results">
      <div class="flex items-center justify-between gap-3 border-b border-white/10 px-3 py-2">
        <p class="truncate text-xs text-slate-400">
          Search results for <span class="font-medium text-slate-200">{props.query}</span>
        </p>
        <button type="button" class="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-white/10 hover:text-slate-100" aria-label="Close search results" onClick={props.onClose}>
          <X size={14} aria-hidden="true" />
        </button>
      </div>
      <Show
        when={props.results.length > 0}
        fallback={<p class="px-3 py-6 text-center text-sm text-slate-500">No scanned items match this search.</p>}
      >
        <ul class="max-h-[min(28rem,calc(100vh-7rem))] overflow-auto p-1.5">
          <For each={props.results}>
            {(result, index) => (
              <li>
                <button
                  type="button"
                  class={`grid w-full grid-cols-[2rem_minmax(0,1fr)_5.5rem] items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-white/[0.06] focus:bg-white/[0.08] focus:outline-none ${
                    index() === props.activeIndex ? "bg-white/[0.08]" : ""
                  }`}
                  aria-current={index() === props.activeIndex ? "true" : undefined}
                  onMouseEnter={() => props.onActiveIndexChange(index())}
                  onClick={() => props.onSelect(result.node)}
                >
                  <span class="flex size-8 items-center justify-center rounded-md bg-white/[0.06] text-slate-300">
                    {result.node.type === "directory" ? <Folder size={15} aria-hidden="true" /> : <File size={15} aria-hidden="true" />}
                  </span>
                  <span class="min-w-0">
                    <span class="block truncate text-sm font-medium text-slate-100">{getScanNodeName(result.node)}</span>
                    <span class="mt-0.5 block truncate text-xs text-slate-500">{getScanNodePath(result.node)}</span>
                    <Show when={result.node.classification}>
                      {(classification) => (
                        <span class="mt-1 flex min-w-0 items-center gap-2">
                          <span class="truncate text-xs text-cyan-100">{classification().category}</span>
                          <span class="rounded border border-white/10 px-1.5 py-0.5 text-[11px] text-slate-300">
                            {formatRiskLabel(classification().risk, classification().isProtected)}
                          </span>
                        </span>
                      )}
                    </Show>
                  </span>
                  <span class="text-right text-sm tabular-nums text-slate-400">{formatBytes(getScanNodeSize(result.node))}</span>
                </button>
              </li>
            )}
          </For>
        </ul>
      </Show>
    </section>
  );
}

function BreadcrumbPath(props: { path: string; fallbackName: string }) {
  const parts = createMemo(() => {
    const cleanParts = props.path.split("/").filter(Boolean);
    if (cleanParts.length === 0) return [props.fallbackName];
    const homeIndex = cleanParts[0] === "Users" && cleanParts.length > 1 ? 1 : -1;
    const displayParts = homeIndex >= 0 ? ["Home", ...cleanParts.slice(homeIndex + 1)] : cleanParts;
    return displayParts.slice(-4);
  });

  return (
    <nav class="electrobun-webkit-app-region-no-drag hidden min-w-0 items-center gap-0.5 text-xs text-slate-400 sm:flex" aria-label="Folder breadcrumb">
      <For each={parts()}>
        {(part, index) => (
          <>
            <Show when={index() > 0}>
              <ChevronRight size={13} class="shrink-0 text-slate-600" aria-hidden="true" />
            </Show>
            <span
              class={`flex h-6 max-w-28 items-center truncate rounded-md px-1.5 ${
                index() === parts().length - 1
                  ? "bg-white/[0.045] text-slate-100"
                  : "text-slate-400"
              }`}
            >
              <Show when={index() === 0}>
                <Home size={12} class="mr-1 shrink-0" aria-hidden="true" />
              </Show>
              <span class="truncate">{part}</span>
            </span>
          </>
        )}
      </For>
    </nav>
  );
}

function HomeScreen(props: {
  scanTargetPath: string;
  canScan: boolean;
  deepScanGenerated: boolean;
  excludedPathCount: number;
  isHomeScanTarget: boolean;
  onPathChange: (path: string) => void;
  onScan: () => void;
  onScanHome: () => void;
  onChooseFolder: () => void;
  onScanPath: (path: string) => void;
  onToggleAdvanced: () => void;
}) {
  const commonTargets = ["DerivedData", "CoreSimulator", "Downloads", "Homebrew cache"];

  return (
    <section class="mx-auto grid h-full min-h-0 max-w-6xl content-start gap-6 overflow-auto py-8">
      <div class="max-w-2xl">
        <h1 class="text-3xl font-semibold text-slate-50">Find what is eating your disk.</h1>
        <p class="mt-3 text-sm leading-6 text-slate-400">
          Start with a common location or scan a specific path. Build a space map first, then choose what to clean.
        </p>
      </div>
      <div class="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(18rem,0.7fr)]">
        <section class="rounded-lg border border-white/10 bg-[#172033] p-5">
          <div class="grid gap-3 sm:grid-cols-3">
            <button type="button" class="inline-flex h-11 items-center justify-center rounded-md border border-cyan-300/50 px-3 text-sm font-medium text-cyan-100 hover:bg-cyan-300/10 disabled:opacity-40" disabled={!props.canScan} onClick={props.onScanHome}>
              Scan Home Folder
            </button>
            <button type="button" class="inline-flex h-11 items-center justify-center rounded-md border border-white/10 px-3 text-sm font-medium text-slate-100 hover:bg-white/10 disabled:opacity-40" disabled={!props.canScan} onClick={() => props.onScanPath("/")}>
              Scan Macintosh HD
            </button>
            <button type="button" class="inline-flex h-11 items-center justify-center rounded-md border border-white/10 px-3 text-sm font-medium text-slate-100 hover:bg-white/10 disabled:opacity-40" disabled={!props.canScan} onClick={props.onChooseFolder}>
              Choose Folder...
            </button>
          </div>
          <div class="mt-6">
            <label class="text-sm font-medium text-slate-200" for="scan-path">
              Scan a specific path
            </label>
            <div class="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
              <input
                id="scan-path"
                class="h-10 min-w-0 rounded-md border border-white/10 bg-[#101827] px-3 font-mono text-sm text-slate-100 outline-none focus:border-cyan-300"
                value={props.scanTargetPath}
                disabled={!props.canScan}
                onInput={(event) => props.onPathChange(event.currentTarget.value)}
              />
              <button type="button" class="inline-flex h-10 items-center justify-center rounded-md border border-cyan-300/50 px-4 text-sm font-medium text-cyan-100 hover:bg-cyan-300/10 disabled:opacity-40" disabled={!props.canScan} onClick={props.onScan}>
                Scan
              </button>
            </div>
            <Show when={props.isHomeScanTarget}>
              <p class="mt-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
                Home-folder scans can touch millions of files. Default excludes skip cloud mirrors and Spotlight metadata.
              </p>
            </Show>
          </div>
          <button type="button" class="mt-5 inline-flex h-8 items-center rounded-md border border-white/10 px-3 text-sm text-slate-300 hover:bg-white/10 hover:text-slate-100" onClick={props.onToggleAdvanced}>
            Advanced scan options
          </button>
          <p class="mt-2 text-xs text-slate-500">
            {props.excludedPathCount} excluded paths · Deep scan {props.deepScanGenerated ? "on" : "off"}
          </p>
        </section>
        <aside class="grid gap-4">
          <section class="rounded-lg border border-white/10 bg-[#172033] p-5">
            <h2 class="text-sm font-semibold text-slate-100">Recent scans</h2>
            <ul class="mt-4 space-y-3 text-sm">
              <li class="flex items-center justify-between gap-3">
                <span class="truncate text-slate-300">/Users/erik</span>
                <span class="shrink-0 tabular-nums text-slate-500">166 GB</span>
              </li>
              <li class="flex items-center justify-between gap-3">
                <span class="truncate text-slate-300">~/Projects</span>
                <span class="shrink-0 tabular-nums text-slate-500">34 GB</span>
              </li>
            </ul>
          </section>
          <section class="rounded-lg border border-white/10 bg-[#172033] p-5">
            <h2 class="text-sm font-semibold text-slate-100">Common places to check</h2>
            <ul class="mt-4 flex flex-wrap gap-2">
              <For each={commonTargets}>
                {(target) => <li class="rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 text-xs text-slate-300">{target}</li>}
              </For>
            </ul>
          </section>
        </aside>
      </div>
      <p class="text-xs text-slate-500">zpace scans locally and moves cleanup items to Trash by default.</p>
    </section>
  );
}

function ScanningScreen(props: {
  scanTargetPath: string;
  root: ScanNode | null;
  viewPath: string | null;
  progress: {
    pathsScanned: number;
    directoriesScanned: number;
    filesScanned: number;
    logicalSizeScanned: number;
    currentPath: string | null;
  } | null;
  summary: Array<{ label: string; value: string }>;
  currentPath: string | null;
  warningCount: number;
  largestItems: Array<{ label: string; value: string; detail: string | null }>;
  onSelect: (node: ScanNode) => void;
  onHighlight: (node: ScanNode | null) => void;
  onViewChange: (node: ScanNode) => void;
}) {
  const summaryRows = createMemo(() => [
    { label: "Found size", value: formatBytes(props.progress?.logicalSizeScanned ?? 0) },
    { label: "Files", value: (props.progress?.filesScanned ?? 0).toLocaleString() },
    { label: "Folders", value: (props.progress?.directoriesScanned ?? 0).toLocaleString() },
    { label: "Warnings", value: props.warningCount.toLocaleString() },
  ]);
  const largestItems = createMemo(() => {
    if (props.largestItems.length > 0) return props.largestItems.slice(0, 5);
    return getScanNodeChildren(props.root)
      .sort((left, right) => getScanNodeSize(right) - getScanNodeSize(left))
      .slice(0, 5)
      .map((node) => ({
        label: getScanNodeName(node),
        value: formatBytes(getScanNodeSize(node)),
        detail: getScanNodePath(node),
      }));
  });

  return (
    <section class="grid h-full min-h-0 gap-4 lg:grid-cols-[minmax(0,2.1fr)_minmax(300px,0.9fr)]">
      <Show
        when={props.root}
        fallback={
          <div class="flex min-h-0 flex-col rounded-lg border border-white/10 bg-[#172033] p-5 shadow-2xl shadow-black/20">
            <div class="flex items-start justify-between gap-3">
              <div>
                <h2 class="text-sm font-semibold text-slate-50">Building space map</h2>
                <p class="mt-1 text-xs text-slate-400">Large folders will appear here as they are discovered.</p>
              </div>
              <span class="rounded-md border border-cyan-300/30 bg-cyan-300/10 px-2 py-1 text-xs text-cyan-100">Scanning</span>
            </div>
            <div class="relative mx-auto my-auto flex aspect-square h-auto max-h-[min(100%,32rem,calc(100vh-16rem))] w-full max-w-[min(100%,32rem,calc(100vh-16rem))] shrink items-center justify-center overflow-hidden">
              <div class="absolute inset-[14%] rounded-full border border-cyan-300/20" />
              <div class="absolute inset-[24%] rounded-full border border-cyan-300/15" />
              <div class="absolute inset-[34%] rounded-full border border-cyan-300/10" />
              <div class="absolute left-[16%] top-[25%] size-3 rounded-full bg-cyan-300/70 shadow-[0_0_18px_rgba(94,234,212,0.25)]" />
              <div class="absolute right-[24%] top-[18%] size-2 rounded-full bg-blue-300/60" />
              <div class="absolute bottom-[23%] left-[28%] size-2.5 rounded-full bg-emerald-300/55" />
              <div class="absolute bottom-[31%] right-[19%] size-2 rounded-full bg-amber-300/55" />
              <div class="size-32 rounded-full border border-white/10 bg-[#101827] shadow-[0_0_40px_rgba(94,234,212,0.08)]" />
              <div class="absolute text-center">
                <p class="text-xs text-slate-400">Building space map</p>
                <p class="mt-1 text-xl font-semibold tabular-nums text-slate-50">{formatBytes(props.progress?.logicalSizeScanned ?? 0)}</p>
                <p class="mt-1 text-[11px] text-slate-500">found so far</p>
              </div>
            </div>
          </div>
        }
      >
        {(scanRoot) => (
          <RadialUsageMap
            root={scanRoot()}
            viewPath={props.viewPath ?? getScanNodePath(scanRoot())}
            onSelect={props.onSelect}
            onHighlight={props.onHighlight}
            onViewChange={props.onViewChange}
          />
        )}
      </Show>
      <aside class="min-h-0 overflow-auto rounded-lg border border-white/10 bg-[#172033]/95 p-5 shadow-2xl shadow-black/20">
        <p class="text-xs font-medium uppercase text-cyan-200">Scanning</p>
        <h2 class="mt-2 break-all text-2xl font-semibold text-slate-50">{props.scanTargetPath}</h2>
        <dl class="mt-5 space-y-3">
          <For each={summaryRows()}>
            {(row) => (
              <div class="flex items-baseline justify-between gap-4">
                <dt class="text-sm text-slate-500">{row.label}</dt>
                <dd class="text-sm font-semibold tabular-nums text-slate-100">{row.value}</dd>
              </div>
            )}
          </For>
        </dl>
        <div class="mt-5">
          <h3 class="text-sm font-semibold text-slate-100">Currently reading</h3>
          <p class="mt-2 break-all rounded-md border border-white/10 bg-[#101827] p-3 font-mono text-xs text-slate-400">
            {props.currentPath ?? "Preparing scan..."}
          </p>
        </div>
        <Show when={largestItems().length > 0}>
          <div class="mt-5">
            <h3 class="text-sm font-semibold text-slate-100">Largest found so far</h3>
            <ul class="mt-3 space-y-2">
              <For each={largestItems()}>
                {(item) => (
                  <li class="grid grid-cols-[minmax(0,1fr)_5.5rem] items-center gap-3 rounded-md border border-white/10 bg-white/[0.03] px-3 py-2">
                    <span class="min-w-0">
                      <span class="block truncate text-sm text-slate-300">{item.label}</span>
                      <Show when={item.detail}>
                        {(detail) => <span class="block truncate text-xs text-slate-600">{detail()}</span>}
                      </Show>
                    </span>
                    <span class="text-right text-sm tabular-nums text-slate-400">{item.value}</span>
                  </li>
                )}
              </For>
            </ul>
          </div>
        </Show>
      </aside>
    </section>
  );
}

function formatMetricValue(value: string): string {
  if (/^\d+$/.test(value)) return Number(value).toLocaleString();
  return value;
}

function InspectorPanel(props: {
  root: ScanNode;
  view: ScanNode;
  selected: ScanNode | null;
  topChildren: ScanNode[];
  reclaimableItems: ScanNode[];
  globalReclaimableCount: number;
  metrics: Array<{ label: string; value: string }>;
  queuedPaths: ReadonlySet<string>;
  scanRootPath: string;
  parentScanPath: string | null;
  onSelect: (node: ScanNode) => void;
  onHighlight: (node: ScanNode | null) => void;
  onAddToQueue: (node: ScanNode) => void;
  onRemoveFromQueue: (path: string) => void;
  onScanPath: (path: string) => void;
  onViewTargets: () => void;
}) {
  const selected = () => props.selected ?? props.view;
  const isViewingSelected = () => getScanNodePath(selected()) === getScanNodePath(props.view);
  const classification = () => selected().classification;
  const hasCleanupTargets = createMemo(() => props.reclaimableItems.length > 0);
  const recommendation = createMemo(() => getCleanupExplanation(selected(), hasCleanupTargets()));
  const recommendationTitle = createMemo(() => getRecommendationTitle(selected(), hasCleanupTargets()));
  const queued = () => props.queuedPaths.has(getScanNodePath(selected()));
  const reclaimableTotal = createMemo(() =>
    formatBytes(props.reclaimableItems.reduce((sum, item) => sum + getScanNodeSize(item), 0)),
  );
  const summaryLine = createMemo(() => createInspectorSummary(props.metrics));

  return (
    <aside class="min-h-0 overflow-hidden rounded-lg border border-white/10 bg-[#172033]/95 p-4 shadow-2xl shadow-black/20">
      <div class="flex min-w-0 items-start justify-between gap-3">
        <div class="min-w-0">
          <h2 class="truncate text-[24px] font-semibold leading-tight text-slate-50">{getScanNodeName(selected())}</h2>
          <p class="mt-1 line-clamp-2 break-all text-xs leading-4 text-slate-500">{getScanNodePath(selected())}</p>
        </div>
        <p class="shrink-0 text-right text-[26px] font-semibold leading-tight tabular-nums text-slate-50">{formatBytes(getScanNodeSize(selected()))}</p>
      </div>
      <Show when={summaryLine()}>
        {(summary) => <p class="mt-2 text-[13px] text-slate-400">{summary()}</p>}
      </Show>
      <div class="mt-3 flex flex-wrap gap-1.5 border-t border-white/10 pt-3">
        <button
          type="button"
          class="inline-flex h-7 items-center gap-1.5 rounded-md border border-white/10 px-2.5 text-xs font-medium text-slate-300 hover:bg-white/10 hover:text-slate-50"
          onClick={() => props.onScanPath(props.scanRootPath)}
        >
          <RefreshCw size={13} aria-hidden="true" />
          Rescan
        </button>
        <Show when={props.parentScanPath}>
          {(parentPath) => (
            <button
              type="button"
              class="inline-flex h-7 items-center gap-1.5 rounded-md border border-white/10 px-2.5 text-xs font-medium text-slate-300 hover:bg-white/10 hover:text-slate-50"
              onClick={() => props.onScanPath(parentPath())}
            >
              <ChevronLeft size={13} aria-hidden="true" />
              Parent
            </button>
          )}
        </Show>
      </div>
      <Show when={hasCleanupTargets()}>
        <section class="mt-3 rounded-md bg-cyan-300/[0.035] p-2.5">
          <ItemList
            title="Cleanup"
            titleDetail={`${reclaimableTotal()} likely reclaimable`}
            items={props.reclaimableItems.slice(0, 3)}
            emptyMessage="No cleanup targets found in this folder."
            emphasized
            flush
            onSelect={props.onSelect}
            onHighlight={props.onHighlight}
            onCollect={props.onAddToQueue}
          />
          <button
            type="button"
            class="mt-1 inline-flex h-6 items-center justify-center rounded-md px-1 text-xs font-medium text-cyan-100 hover:bg-cyan-300/10 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={props.reclaimableItems.length === 0}
            onClick={props.onViewTargets}
          >
            View all
          </button>
        </section>
      </Show>
      <Show when={props.globalReclaimableCount > props.reclaimableItems.length}>
        <p class="mt-2 text-xs text-slate-500">
          Showing targets contained in {getScanNodeName(props.view)}. Global cleanup targets are available from the full scan.
        </p>
      </Show>
      <ItemList
        title="Top items"
        items={props.topChildren.slice(0, 3)}
        emptyMessage="No child items in this folder."
        onSelect={props.onSelect}
        onHighlight={props.onHighlight}
        onCollect={props.onAddToQueue}
      />
      <div class="mt-3 border-t border-white/10 pt-3">
        <div class="flex items-center justify-between gap-3">
          <h3 class="text-sm font-semibold text-slate-100">Recommendation</h3>
          <span class="rounded-md border border-cyan-300/30 bg-cyan-300/10 px-2 py-1 text-xs text-cyan-100">
            {formatRiskLabel(classification()?.risk, classification()?.isProtected)}
          </span>
        </div>
        <p class="mt-2 text-[13px] font-medium text-slate-200">{recommendationTitle()}</p>
        <p class="mt-1 text-[13px] leading-5 text-slate-400">{recommendation()}</p>
        <Show when={getScanNodePath(selected()) !== getScanNodePath(props.root)}>
          <div class="mt-3 flex flex-wrap gap-2">
            <button type="button" class="inline-flex h-8 items-center gap-1.5 rounded-md border border-cyan-300/45 px-2.5 text-xs font-medium text-cyan-100 hover:bg-cyan-300/10" onClick={() => queued() ? props.onRemoveFromQueue(getScanNodePath(selected())) : props.onAddToQueue(selected())}>
              {queued() ? <X size={13} aria-hidden="true" /> : <FolderOpen size={13} aria-hidden="true" />}
              {queued() ? "Remove from cleanup" : "Collect for cleanup"}
            </button>
          </div>
        </Show>
      </div>
    </aside>
  );
}

function ItemList(props: {
  title: string;
  titleDetail?: string;
  items: ScanNode[];
  emptyMessage: string;
  emphasized?: boolean;
  flush?: boolean;
  onSelect: (node: ScanNode) => void;
  onHighlight: (node: ScanNode | null) => void;
  onCollect: (node: ScanNode) => void;
}) {
  return (
    <div class={props.flush ? "" : "mt-3"}>
      <div class="flex items-center justify-between gap-3">
        <h3 class="text-[15px] font-semibold text-slate-100">{props.title}</h3>
        <Show when={props.titleDetail}>
          {(detail) => <span class="text-xs font-semibold tabular-nums text-cyan-100">{detail()}</span>}
        </Show>
      </div>
      <Show when={props.items.length > 0} fallback={<p class="mt-3 text-sm text-slate-500">{props.emptyMessage}</p>}>
        <ul class="mt-1 space-y-0.5">
          <For each={props.items}>
            {(item, index) => (
              <li
                class={`group grid min-h-9 grid-cols-[minmax(0,1fr)_4.75rem_1.75rem] items-center gap-2 rounded-md px-1.5 py-1 hover:bg-white/5 ${props.emphasized ? "bg-cyan-300/[0.03]" : ""}`}
                onMouseEnter={() => props.onHighlight(item)}
                onMouseLeave={() => props.onHighlight(null)}
              >
                <button type="button" class="flex min-w-0 items-center gap-2 truncate text-left text-[13px] text-slate-200" onClick={() => props.onSelect(item)}>
                  <span class="size-2 shrink-0 rounded-full" style={{ "background-color": getRadialNodeColor(index()) }} aria-hidden="true" />
                  <span class="truncate">{getScanNodeName(item)}</span>
                </button>
                <span class="text-right text-[13px] tabular-nums text-slate-400">{formatBytes(getScanNodeSize(item))}</span>
                <button
                  type="button"
                  class="inline-flex size-6 items-center justify-center rounded-md text-slate-400 opacity-0 hover:bg-white/10 hover:text-slate-50 group-hover:opacity-100 focus:opacity-100"
                  aria-label={props.emphasized ? `Collect ${getScanNodeName(item)}` : `Inspect ${getScanNodeName(item)}`}
                  onClick={() => props.emphasized ? props.onCollect(item) : props.onSelect(item)}
                >
                  {props.emphasized ? <FolderOpen size={12} aria-hidden="true" /> : <ChevronRight size={13} aria-hidden="true" />}
                </button>
              </li>
            )}
          </For>
        </ul>
      </Show>
    </div>
  );
}

function buildNodeLookup(root: ScanNode): Map<string, ScanNode> {
  const index = new Map<string, ScanNode>();
  const stack = [root];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) continue;
    index.set(getScanNodePath(node), node);
    stack.push(...getScanNodeChildren(node));
  }
  return index;
}

function getCleanupExplanation(node: ScanNode, hasCleanupTargets = false): string {
  const name = getScanNodeName(node).toLowerCase();
  const path = getScanNodePath(node).toLowerCase();
  if (hasCleanupTargets && !node.classification) {
    return "This folder contains generated or cache-like items that can usually be regenerated. Review targets before moving anything to Trash.";
  }
  if (name === ".turbo") {
    return ".turbo is a Turborepo cache folder. It is usually safe to delete and future builds can regenerate it.";
  }
  if (name === "node_modules") {
    return "node_modules contains installed dependencies. It is usually recoverable by reinstalling dependencies for this project.";
  }
  if (name === "deriveddata") {
    return "DerivedData contains Xcode build artifacts. It is usually safe to clean when Xcode is not actively building.";
  }
  if (name === "coresimulator" || (path && path.includes("/coresimulator/"))) {
    return "CoreSimulator contains iOS simulator data. Review first because it can include installed simulator apps and device state.";
  }
  return node.classification?.recommendation ?? "zpace does not recognize this as disposable cache or generated build output.";
}

function getRecommendationTitle(node: ScanNode, hasCleanupTargets = false): string {
  const classification = node.classification;
  if (hasCleanupTargets && !classification) return "Contains cleanup targets";
  if (classification?.isProtected) return "Do not clean directly";
  if (classification?.risk === "low") return "Usually safe to clean";
  if (classification?.risk === "medium") return "Review first";
  if (classification?.risk === "high") return "Not a cleanup target";
  return "Review first";
}

function createInspectorSummary(metrics: Array<{ label: string; value: string }>): string | null {
  const metricMap = new Map(metrics.map((metric) => [metric.label.toLowerCase(), formatMetricValue(metric.value)]));
  const summaryMetrics = [
    metricMap.has("files") ? `${metricMap.get("files")} files` : null,
    metricMap.has("allocated") ? `${metricMap.get("allocated")} allocated` : null,
    metricMap.has("reclaimable") ? `${metricMap.get("reclaimable")} reclaimable` : null,
  ].filter((metric): metric is string => Boolean(metric));
  return summaryMetrics.length > 0 ? summaryMetrics.join(" · ") : null;
}

function CleanupTargets(props: {
  items: ScanNode[];
  view: ScanNode | null;
  queuedPaths: ReadonlySet<string>;
  onCollect: (node: ScanNode) => void;
  onClose: () => void;
  onReviewQueue: () => void;
}) {
  return (
    <section class="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-[#172033]/95 px-3 py-3 shadow-2xl shadow-black/40 backdrop-blur">
      <div class="mx-auto max-w-7xl">
        <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 class="text-sm font-semibold text-slate-100">Cleanup targets</h2>
            <p class="mt-1 text-sm text-slate-400">
              Suggested reclaimable folders in {props.view ? getScanNodeName(props.view) : "this folder"}.
            </p>
          </div>
          <div class="flex flex-wrap gap-2">
            <button type="button" class="inline-flex h-8 items-center rounded-md border border-white/10 px-3 text-sm font-medium text-slate-100 hover:bg-white/10" onClick={props.onClose}>
              Back to map
            </button>
            <button type="button" class="inline-flex h-8 items-center gap-2 rounded-md border border-cyan-300/50 px-3 text-sm font-medium text-cyan-100 hover:bg-cyan-300/10" onClick={props.onReviewQueue}>
              <FolderOpen size={15} aria-hidden="true" />
              Open queue
            </button>
          </div>
        </div>
        <Show when={props.items.length > 0} fallback={<p class="mt-4 text-sm text-slate-500">No routine cleanup targets were detected.</p>}>
          <ul class="mt-3 grid max-h-48 gap-2 overflow-auto md:grid-cols-2 xl:grid-cols-3">
            <For each={props.items}>
              {(item) => {
                const queued = () => props.queuedPaths.has(getScanNodePath(item));
                return (
                  <li class="min-w-0 rounded-md border border-white/10 bg-white/[0.03] p-3">
                    <div class="flex min-w-0 items-start justify-between gap-3">
                      <div class="min-w-0">
                        <p class="truncate text-sm font-medium text-slate-100">{getScanNodeName(item)}</p>
                        <p class="mt-1 truncate text-xs text-slate-500">{getScanNodePath(item)}</p>
                      </div>
                      <span class="shrink-0 text-sm tabular-nums text-slate-300">{formatBytes(getScanNodeSize(item))}</span>
                    </div>
                    <div class="mt-3 flex items-center justify-between gap-3">
                      <span class="rounded-md border border-cyan-300/30 bg-cyan-300/10 px-2 py-1 text-xs text-cyan-100">
                        {formatRiskLabel(item.classification?.risk, item.classification?.isProtected)}
                      </span>
                      <button
                        type="button"
                        class="inline-flex h-8 items-center gap-2 rounded-md border border-cyan-300/50 px-3 text-sm font-medium text-cyan-100 hover:bg-cyan-300/10 disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={queued()}
                        onClick={() => props.onCollect(item)}
                      >
                        <FolderOpen size={14} aria-hidden="true" />
                        {queued() ? "Collected" : "Collect"}
                      </button>
                    </div>
                  </li>
                );
              }}
            </For>
          </ul>
        </Show>
      </div>
    </section>
  );
}

function CleanupQueue(props: {
  summary: ReturnType<typeof createCleanupQueueSummary>;
  onRemove: (path: string) => void;
  onClear: () => void;
  onClose: () => void;
  onReview: () => void;
}) {
  const isEmpty = () => props.summary.items.length === 0;

  return (
    <section class="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-[#172033]/95 px-3 py-2 shadow-2xl shadow-black/40 backdrop-blur">
      <div class="mx-auto flex min-h-10 max-w-7xl flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div class="text-sm">
          <span class="font-semibold text-slate-100">Cleanup queue:</span>
          <span class="ml-2 text-slate-400">
            {props.summary.itemCountLabel} · {props.summary.totalSizeLabel} selected
          </span>
        </div>
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            class="inline-flex h-8 items-center rounded-md border border-white/10 px-3 text-sm font-medium text-slate-100 hover:bg-white/10"
            onClick={props.onClose}
          >
            Back to map
          </button>
          <Show when={!isEmpty()}>
            <button
              type="button"
              class="inline-flex h-8 items-center gap-2 rounded-md border border-white/10 px-3 text-sm font-medium text-slate-100 hover:bg-white/10"
              onClick={props.onClear}
            >
              <X size={15} aria-hidden="true" />
              Clear
            </button>
          </Show>
          <button
            type="button"
            class="inline-flex h-8 items-center gap-2 rounded-md border border-cyan-300/50 px-3 text-sm font-medium text-cyan-100 hover:bg-cyan-300/10 disabled:cursor-not-allowed disabled:opacity-40"
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
        fallback={null}
      >
        <ul class="mx-auto mt-3 max-h-36 max-w-7xl divide-y divide-white/10 overflow-auto">
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
                          {formatRiskLabel(risk())}
                        </span>
                      )}
                    </Show>
                    <Show when={item.isProtected}>
                      <span class="rounded-md border border-red-500/40 bg-red-500/10 px-1.5 py-0.5 text-[11px] text-red-200">
                        Protected
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
    <section class="mx-auto flex h-full min-h-0 max-w-5xl flex-col rounded-lg border border-emerald-500/40 bg-neutral-900 p-5">
      <div class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <button type="button" class="mb-4 inline-flex h-8 items-center gap-2 rounded-md border border-neutral-700 px-3 text-sm font-medium text-neutral-100 hover:bg-neutral-800" onClick={props.onCancel}>
            <ChevronLeft size={15} aria-hidden="true" />
            Back to map
          </button>
          <h2 class="text-2xl font-semibold text-neutral-100">Review cleanup</h2>
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
      <ul class="mt-4 min-h-0 flex-1 divide-y divide-neutral-800 overflow-auto rounded-md border border-neutral-800">
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

function CleanupComplete(props: {
  result: CleanupExecutionResult;
  canRescan: boolean;
  onBackToMap: () => void;
  onRescan: () => void;
}) {
  return (
      <section class="mx-auto h-full min-h-0 max-w-5xl overflow-auto rounded-lg border border-neutral-800 bg-neutral-900 p-5">
        <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 class="text-2xl font-semibold text-neutral-100">Cleanup complete</h2>
            <p class="mt-1 text-sm text-neutral-500">
              {props.result.itemCountLabel}, {props.result.totalSizeLabel}, {props.result.status}.
            </p>
          </div>
          <div class="flex flex-wrap gap-2">
            <button type="button" class="inline-flex h-9 items-center rounded-md border border-neutral-700 px-3 text-sm font-medium text-neutral-100 hover:bg-neutral-800" onClick={props.onBackToMap}>
              Back to map
            </button>
          <button
            type="button"
            class="inline-flex h-9 items-center gap-2 rounded-md border border-neutral-700 px-3 text-sm font-medium text-neutral-100 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={!props.canRescan}
            onClick={props.onRescan}
          >
            <RefreshCw size={15} aria-hidden="true" />
            Rescan
          </button>
          </div>
        </div>
        <ul class="mt-4 space-y-3">
              <li class="rounded-md border border-neutral-800 p-3">
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <p class="text-sm font-medium text-neutral-100">
                    {props.result.itemCountLabel}, {props.result.totalSizeLabel}
                  </p>
                  <span class="rounded-md border border-neutral-700 px-2 py-1 text-xs text-neutral-300">
                    {props.result.status}
                  </span>
                </div>
                <p class="mt-1 text-xs text-neutral-500">
                  {new Date(props.result.completedAt).toLocaleString()}
                </p>
                <ul class="mt-3 space-y-2">
                  <For each={props.result.results}>
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
        </ul>
      </section>
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
