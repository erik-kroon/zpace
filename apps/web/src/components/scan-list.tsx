import type { ScanNode, ScanRiskLevel } from "@zpace/scanner/src/schema";
import {
  ArrowDownAZ,
  ArrowDownUp,
  ArrowUpAZ,
  ChevronRight,
  File,
  Folder,
  Link,
  Package,
  Plus,
  X,
} from "lucide-solid";
import { createMemo, createSignal, For, Show } from "solid-js";

import {
  buildScanNodeIndex,
  createChildScanRows,
  formatRiskLabel,
  getScanNodeChildren,
  getScanNodeName,
  getScanNodePath,
  getScanNodeSize,
  type ScanRow,
} from "@/lib/scan-presentation";

interface ScanListProps {
  root: ScanNode;
  queuedPaths?: ReadonlySet<string>;
  onAddToQueue?: (node: ScanNode) => void;
  onRemoveFromQueue?: (path: string) => void;
  onDeepScan?: (path: string) => void;
}

type SortKey = "name" | "logicalSize" | "allocatedSize" | "type" | "category" | "risk";
type SortDirection = "asc" | "desc";

const sortLabels: Record<SortKey, string> = {
  name: "Name",
  logicalSize: "Logical size",
  allocatedSize: "Allocated size",
  type: "Type",
  category: "Category",
  risk: "Risk",
};

const riskRank: Record<ScanRiskLevel, number> = {
  low: 1,
  medium: 2,
  high: 3,
};

export function ScanList(props: ScanListProps) {
  const [currentPath, setCurrentPath] = createSignal(getScanNodePath(props.root));
  const [sortKey, setSortKey] = createSignal<SortKey>("logicalSize");
  const [sortDirection, setSortDirection] = createSignal<SortDirection>("desc");
  const [categoryFilter, setCategoryFilter] = createSignal("all");

  const nodeIndex = createMemo(() => buildScanNodeIndex(props.root));
  const currentNode = createMemo(() => nodeIndex().get(currentPath())?.node ?? props.root);
  const breadcrumbs = createMemo(
    () => nodeIndex().get(getScanNodePath(currentNode()))?.breadcrumbs ?? [props.root],
  );
  const categoryOptions = createMemo(() =>
    Array.from(
      new Set(
        getScanNodeChildren(currentNode())
          .map((node) => node.classification?.category)
          .filter((category): category is string => Boolean(category)),
      ),
    ).sort((left, right) => left.localeCompare(right)),
  );
  const activeCategoryFilter = createMemo(() =>
    (categoryOptions() ?? []).includes(categoryFilter()) ? categoryFilter() : "all",
  );
  const rows = createMemo(() =>
    sortRows(
      filterRows(createChildScanRows(currentNode()), activeCategoryFilter()),
      sortKey(),
      sortDirection(),
    ),
  );

  const navigateTo = (path: string) => {
    setCurrentPath(path);
    setCategoryFilter("all");
  };

  return (
    <div class="overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900">
      <div class="border-b border-neutral-800 px-4 py-3">
        <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <nav class="flex min-w-0 flex-wrap items-center gap-1 text-xs" aria-label="List breadcrumb">
            <For each={breadcrumbs()}>
              {(node, index) => (
                <>
                  <Show when={index() > 0}>
                    <ChevronRight size={13} class="text-neutral-600" aria-hidden="true" />
                  </Show>
                  <button
                    type="button"
                    class="max-w-36 truncate rounded-md px-2 py-1 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
                    aria-current={getScanNodePath(node) === getScanNodePath(currentNode()) ? "page" : undefined}
                    onClick={() => navigateTo(getScanNodePath(node))}
                  >
                    {getScanNodeName(node)}
                  </button>
                </>
              )}
            </For>
          </nav>

          <div class="grid gap-2 sm:flex sm:flex-wrap sm:items-center">
            <label class="grid gap-1 text-xs text-neutral-500 sm:flex sm:items-center sm:gap-2">
              Category
              <select
                class="h-8 rounded-md border border-neutral-700 bg-neutral-950 px-2 text-xs text-neutral-200"
                value={activeCategoryFilter()}
                onInput={(event) => setCategoryFilter(event.currentTarget.value)}
              >
                <option value="all">All</option>
                <For each={categoryOptions()}>
                  {(category) => <option value={category}>{category}</option>}
                </For>
              </select>
            </label>

            <label class="grid gap-1 text-xs text-neutral-500 sm:flex sm:items-center sm:gap-2">
              Sort
              <select
                class="h-8 rounded-md border border-neutral-700 bg-neutral-950 px-2 text-xs text-neutral-200"
                value={sortKey()}
                onInput={(event) => setSortKey(event.currentTarget.value as SortKey)}
              >
                <For each={Object.entries(sortLabels) as Array<[SortKey, string]>}>
                  {([value, label]) => <option value={value}>{label}</option>}
                </For>
              </select>
            </label>

            <button
              type="button"
              class="inline-flex size-8 items-center justify-center rounded-md border border-neutral-700 text-neutral-300 hover:bg-neutral-800 hover:text-neutral-100"
              aria-label={`Sort ${sortDirection() === "asc" ? "descending" : "ascending"}`}
              onClick={() => setSortDirection(sortDirection() === "asc" ? "desc" : "asc")}
            >
              <Show
                when={sortKey() === "name"}
                fallback={<ArrowDownUp size={15} aria-hidden="true" />}
              >
                <Show
                  when={sortDirection() === "asc"}
                  fallback={<ArrowUpAZ size={15} aria-hidden="true" />}
                >
                  <ArrowDownAZ size={15} aria-hidden="true" />
                </Show>
              </Show>
            </button>
          </div>
        </div>
      </div>

      <div class="hidden grid-cols-[minmax(0,1fr)_7rem_7rem_10rem_8rem_6rem] gap-4 border-b border-neutral-800 px-4 py-3 text-xs font-medium uppercase text-neutral-500 lg:grid">
        <span>Item</span>
        <span class="text-right">Logical</span>
        <span class="text-right">Allocated</span>
        <span>Classification</span>
        <span class="text-right">Status</span>
        <span class="text-right">Queue</span>
      </div>
      <ul>
        <For each={rows()}>
          {(row) => (
            <li
              class="grid gap-3 border-b border-neutral-800 px-4 py-3 last:border-b-0 lg:grid-cols-[minmax(0,1fr)_7rem_7rem_10rem_8rem_6rem] lg:gap-4"
              data-scan-row={getScanNodeName(row.node)}
            >
              <div class="flex min-w-0 items-center gap-3">
                <span class="flex size-8 shrink-0 items-center justify-center rounded-md bg-neutral-800 text-neutral-300">
                  <NodeIcon node={row.node} />
                </span>
                <div class="min-w-0">
                  <Show
                    when={row.node.type === "directory" && getScanNodeChildren(row.node).length > 0}
                    fallback={
                      <p class="truncate text-sm font-medium text-neutral-100">{getScanNodeName(row.node)}</p>
                    }
                  >
                    <button
                      type="button"
                      class="max-w-full truncate text-left text-sm font-medium text-neutral-100 hover:text-emerald-300"
                      onClick={() => navigateTo(getScanNodePath(row.node))}
                    >
                      {getScanNodeName(row.node)}
                    </button>
                  </Show>
                  <p class="truncate text-xs text-neutral-500">{getScanNodePath(row.node)}</p>
                </div>
              </div>
              <dl class="grid grid-cols-2 gap-3 text-sm lg:contents">
                <div class="lg:self-center lg:text-right lg:tabular-nums lg:text-neutral-300">
                  <dt class="text-[11px] uppercase text-neutral-500 lg:sr-only">Logical</dt>
                  <dd class="mt-0.5 tabular-nums text-neutral-300">{row.sizeLabel}</dd>
                </div>
                <div class="lg:self-center lg:text-right lg:tabular-nums lg:text-neutral-300">
                  <dt class="text-[11px] uppercase text-neutral-500 lg:sr-only">Allocated</dt>
                  <dd class="mt-0.5 tabular-nums text-neutral-300">{row.allocatedSizeLabel}</dd>
                </div>
              </dl>
              <div class="min-w-0 self-center">
                <Show
                  when={row.node.classification}
                  fallback={<span class="text-xs text-neutral-600">-</span>}
                >
                  {(classification) => (
                    <div class="min-w-0">
                      <div class="flex min-w-0 items-center gap-2">
                        <span class="truncate text-sm font-medium text-neutral-200">
                          {classification().category}
                        </span>
                        <span class={`rounded-md border px-1.5 py-0.5 text-[11px] ${riskClass(classification().risk)}`}>
                          {formatRiskLabel(classification().risk, classification().isProtected)}
                        </span>
                        <Show when={classification().isProtected}>
                          <span class="rounded-md border border-red-500/40 bg-red-500/10 px-1.5 py-0.5 text-[11px] text-red-200">
                            Protected
                          </span>
                        </Show>
                      </div>
                      <p class="mt-1 line-clamp-2 text-xs text-neutral-500">
                        {classification().recommendation}
                      </p>
                    </div>
                  )}
                </Show>
              </div>
              <div class="self-center lg:text-right">
                <span class="rounded-md border border-neutral-700 px-2 py-1 text-xs text-neutral-300">
                  {row.node.status}
                </span>
                <Show when={row.childCountLabel}>
                  {(childCountLabel) => (
                    <p class="mt-1 text-xs text-neutral-500">{childCountLabel()}</p>
                  )}
                </Show>
                <Show when={row.node.childrenTruncated && props.onDeepScan}>
                  <button
                    type="button"
                    class="mt-2 inline-flex h-7 items-center justify-center rounded-md border border-neutral-700 px-2 text-xs text-neutral-300 hover:bg-neutral-800 hover:text-neutral-100"
                    onClick={() => props.onDeepScan?.(getScanNodePath(row.node))}
                  >
                    Deep scan
                  </button>
                </Show>
              </div>
              <div class="self-center lg:text-right">
                <QueueButton
                  node={row.node}
                  isQueued={props.queuedPaths?.has(getScanNodePath(row.node)) ?? false}
                  onAdd={props.onAddToQueue}
                  onRemove={props.onRemoveFromQueue}
                />
              </div>
            </li>
          )}
        </For>
      </ul>
      <Show when={rows().length === 0}>
        <div class="px-4 py-8 text-center text-sm text-neutral-500">No items match this view.</div>
      </Show>
    </div>
  );
}

function filterRows(rows: ScanRow[], category: string): ScanRow[] {
  if (category === "all") return rows;
  return rows.filter((row) => row.node.classification?.category === category);
}

function sortRows(rows: ScanRow[], key: SortKey, direction: SortDirection): ScanRow[] {
  const directionMultiplier = direction === "asc" ? 1 : -1;

  return [...rows].sort((left, right) => {
    const result = compareRows(left, right, key);
    if (result !== 0) return result * directionMultiplier;
    return getScanNodeName(left.node).localeCompare(getScanNodeName(right.node));
  });
}

function compareRows(left: ScanRow, right: ScanRow, key: SortKey): number {
  if (key === "name") return getScanNodeName(left.node).localeCompare(getScanNodeName(right.node));
  if (key === "logicalSize") return getScanNodeSize(left.node) - getScanNodeSize(right.node);
  if (key === "allocatedSize") {
    return (left.node.allocatedSize ?? -1) - (right.node.allocatedSize ?? -1);
  }
  if (key === "type") return (left.node.type ?? "other").localeCompare(right.node.type ?? "other");
  if (key === "category") {
    return (left.node.classification?.category ?? "").localeCompare(
      right.node.classification?.category ?? "",
    );
  }
  return riskValue(left.node.classification?.risk) - riskValue(right.node.classification?.risk);
}

function riskValue(risk: ScanRiskLevel | undefined): number {
  return risk ? riskRank[risk] : 0;
}

function NodeIcon(props: { node: ScanNode }) {
  if (props.node.type === "directory") return <Folder size={16} aria-label="Directory" />;
  if (props.node.type === "symlink") return <Link size={16} aria-label="Symlink" />;
  if (props.node.type === "file") return <File size={16} aria-label="File" />;
  return <Package size={16} aria-label="Other item" />;
}

function QueueButton(props: {
  node: ScanNode;
  isQueued: boolean;
  onAdd?: (node: ScanNode) => void;
  onRemove?: (path: string) => void;
}) {
  const canQueue = () => Boolean(props.onAdd && props.onRemove);

  return (
    <button
      type="button"
      class="inline-flex h-8 min-w-20 items-center justify-center gap-1.5 rounded-md border border-neutral-700 px-2 text-xs font-medium text-neutral-300 hover:bg-neutral-800 hover:text-neutral-100 disabled:cursor-not-allowed disabled:opacity-40"
      disabled={!canQueue()}
      aria-pressed={props.isQueued}
      onClick={() => {
        if (props.isQueued) props.onRemove?.(getScanNodePath(props.node));
        else props.onAdd?.(props.node);
      }}
    >
      <Show when={props.isQueued} fallback={<Plus size={13} aria-hidden="true" />}>
        <X size={13} aria-hidden="true" />
      </Show>
      {props.isQueued ? "Remove" : "Collect"}
    </button>
  );
}

function riskClass(risk: ScanRiskLevel): string {
  if (risk === "low") return "border-emerald-500/40 bg-emerald-500/10 text-emerald-200";
  if (risk === "medium") return "border-amber-500/40 bg-amber-500/10 text-amber-200";
  return "border-red-500/40 bg-red-500/10 text-red-200";
}
