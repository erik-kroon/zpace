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
} from "lucide-solid";
import { createMemo, createSignal, For, Show } from "solid-js";

import {
  buildScanNodeIndex,
  createChildScanRows,
  type ScanRow,
} from "@/lib/scan-presentation";

interface ScanListProps {
  root: ScanNode;
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
  const [currentPath, setCurrentPath] = createSignal(props.root.path);
  const [sortKey, setSortKey] = createSignal<SortKey>("logicalSize");
  const [sortDirection, setSortDirection] = createSignal<SortDirection>("desc");
  const [categoryFilter, setCategoryFilter] = createSignal("all");

  const nodeIndex = createMemo(() => buildScanNodeIndex(props.root));
  const currentNode = createMemo(() => nodeIndex().get(currentPath())?.node ?? props.root);
  const breadcrumbs = createMemo(
    () => nodeIndex().get(currentNode().path)?.breadcrumbs ?? [props.root],
  );
  const categoryOptions = createMemo(() =>
    Array.from(
      new Set(
        currentNode()
          .children.map((node) => node.classification?.category)
          .filter((category): category is string => Boolean(category)),
      ),
    ).sort((left, right) => left.localeCompare(right)),
  );
  const activeCategoryFilter = createMemo(() =>
    categoryOptions().includes(categoryFilter()) ? categoryFilter() : "all",
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
                    aria-current={node.path === currentNode().path ? "page" : undefined}
                    onClick={() => navigateTo(node.path)}
                  >
                    {node.name}
                  </button>
                </>
              )}
            </For>
          </nav>

          <div class="flex flex-wrap items-center gap-2">
            <label class="flex items-center gap-2 text-xs text-neutral-500">
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

            <label class="flex items-center gap-2 text-xs text-neutral-500">
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

      <div class="grid grid-cols-[minmax(0,1fr)_7rem_7rem_10rem_8rem] gap-4 border-b border-neutral-800 px-4 py-3 text-xs font-medium uppercase text-neutral-500">
        <span>Item</span>
        <span class="text-right">Logical</span>
        <span class="text-right">Allocated</span>
        <span>Classification</span>
        <span class="text-right">Status</span>
      </div>
      <ul>
        <For each={rows()}>
          {(row) => (
            <li
              class="grid grid-cols-[minmax(0,1fr)_7rem_7rem_10rem_8rem] gap-4 border-b border-neutral-800 px-4 py-3 last:border-b-0"
              data-scan-row={row.node.name}
            >
              <div class="flex min-w-0 items-center gap-3">
                <span class="flex size-8 shrink-0 items-center justify-center rounded-md bg-neutral-800 text-neutral-300">
                  <NodeIcon node={row.node} />
                </span>
                <div class="min-w-0">
                  <Show
                    when={row.node.type === "directory" && row.node.children.length > 0}
                    fallback={
                      <p class="truncate text-sm font-medium text-neutral-100">{row.node.name}</p>
                    }
                  >
                    <button
                      type="button"
                      class="max-w-full truncate text-left text-sm font-medium text-neutral-100 hover:text-emerald-300"
                      onClick={() => navigateTo(row.node.path)}
                    >
                      {row.node.name}
                    </button>
                  </Show>
                  <p class="truncate text-xs text-neutral-500">{row.node.path}</p>
                </div>
              </div>
              <div class="self-center text-right text-sm tabular-nums text-neutral-300">
                {row.sizeLabel}
              </div>
              <div class="self-center text-right text-sm tabular-nums text-neutral-300">
                {row.allocatedSizeLabel}
              </div>
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
                          {classification().risk}
                        </span>
                        <Show when={classification().isProtected}>
                          <span class="rounded-md border border-red-500/40 bg-red-500/10 px-1.5 py-0.5 text-[11px] text-red-200">
                            protected
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
              <div class="self-center text-right">
                <span class="rounded-md border border-neutral-700 px-2 py-1 text-xs text-neutral-300">
                  {row.node.status}
                </span>
                <Show when={row.childCountLabel}>
                  {(childCountLabel) => (
                    <p class="mt-1 text-xs text-neutral-500">{childCountLabel()}</p>
                  )}
                </Show>
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
    return left.node.name.localeCompare(right.node.name);
  });
}

function compareRows(left: ScanRow, right: ScanRow, key: SortKey): number {
  if (key === "name") return left.node.name.localeCompare(right.node.name);
  if (key === "logicalSize") return left.node.logicalSize - right.node.logicalSize;
  if (key === "allocatedSize") {
    return (left.node.allocatedSize ?? -1) - (right.node.allocatedSize ?? -1);
  }
  if (key === "type") return left.node.type.localeCompare(right.node.type);
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

function riskClass(risk: ScanRiskLevel): string {
  if (risk === "low") return "border-emerald-500/40 bg-emerald-500/10 text-emerald-200";
  if (risk === "medium") return "border-amber-500/40 bg-amber-500/10 text-amber-200";
  return "border-red-500/40 bg-red-500/10 text-red-200";
}
