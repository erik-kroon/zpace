import type { ScanNode, ScanRiskLevel } from "@zpace/scanner/src/schema";
import { File, Folder, Link, Package } from "lucide-solid";
import { createMemo, For, Show } from "solid-js";

import { createScanRows } from "@/lib/scan-presentation";

interface ScanListProps {
  root: ScanNode;
}

export function ScanList(props: ScanListProps) {
  const rows = createMemo(() => createScanRows(props.root));

  return (
    <div class="overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900">
      <div class="grid grid-cols-[minmax(0,1fr)_7rem_10rem_8rem] gap-4 border-b border-neutral-800 px-4 py-3 text-xs font-medium uppercase text-neutral-500">
        <span>Item</span>
        <span class="text-right">Size</span>
        <span>Classification</span>
        <span class="text-right">Status</span>
      </div>
      <ul>
        <For each={rows()}>
          {(row) => (
            <li class="grid grid-cols-[minmax(0,1fr)_7rem_10rem_8rem] gap-4 border-b border-neutral-800 px-4 py-3 last:border-b-0">
              <div class="flex min-w-0 items-center gap-3">
                <span class="flex size-8 shrink-0 items-center justify-center rounded-md bg-neutral-800 text-neutral-300">
                  <NodeIcon node={row.node} />
                </span>
                <div class="min-w-0">
                  <p class="truncate text-sm font-medium text-neutral-100">{row.node.name}</p>
                  <p class="truncate text-xs text-neutral-500">{row.node.path}</p>
                </div>
              </div>
              <div class="self-center text-right text-sm tabular-nums text-neutral-300">
                {row.sizeLabel}
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
    </div>
  );
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
