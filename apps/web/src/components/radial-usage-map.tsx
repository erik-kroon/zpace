import type { ScanNode } from "@zpace/scanner/src/schema";
import { ChevronRight } from "lucide-solid";
import { createMemo, createSignal, For, Show } from "solid-js";

import { formatBytes } from "@/lib/scan-presentation";

interface RadialUsageMapProps {
  root: ScanNode;
}

interface Segment {
  node: ScanNode;
  path: string;
  depth: number;
  startAngle: number;
  endAngle: number;
}

interface IndexedNode {
  node: ScanNode;
  breadcrumbs: ScanNode[];
}

const center = 160;
const innerRadius = 54;
const ringWidth = 42;
const gapRadians = 0.008;
const palette = ["#34d399", "#60a5fa", "#f59e0b", "#f472b6", "#a78bfa", "#2dd4bf"];

export function RadialUsageMap(props: RadialUsageMapProps) {
  const [currentPath, setCurrentPath] = createSignal(props.root.path);
  const nodeIndex = createMemo(() => buildNodeIndex(props.root));
  const currentNode = createMemo(() => nodeIndex().get(currentPath())?.node ?? props.root);
  const breadcrumbs = createMemo(
    () => nodeIndex().get(currentNode().path)?.breadcrumbs ?? [props.root],
  );
  const segments = createMemo(() => buildSegments(currentNode()));

  return (
    <section class="grid gap-4 lg:grid-cols-[minmax(0,23rem)_minmax(0,1fr)]">
      <div class="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
        <div class="flex items-start justify-between gap-3">
          <div>
            <h2 class="text-sm font-semibold text-neutral-100">Radial usage</h2>
            <p class="mt-1 text-xs text-neutral-500">Click folders to drill into scan data.</p>
          </div>
          <span class="rounded-md border border-neutral-700 px-2 py-1 text-xs text-neutral-400">
            {currentNode().children.length} items
          </span>
        </div>

        <nav class="mt-4 flex min-w-0 flex-wrap items-center gap-1 text-xs" aria-label="Folder breadcrumb">
          <For each={breadcrumbs()}>
            {(node, index) => (
              <>
                <Show when={index() > 0}>
                  <ChevronRight size={13} class="text-neutral-600" aria-hidden="true" />
                </Show>
                <button
                  type="button"
                  class="max-w-32 truncate rounded-md px-2 py-1 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
                  aria-current={node.path === currentNode().path ? "page" : undefined}
                  onClick={() => setCurrentPath(node.path)}
                >
                  {node.name}
                </button>
              </>
            )}
          </For>
        </nav>

        <div class="relative mx-auto mt-4 aspect-square max-w-80">
          <svg viewBox="0 0 320 320" role="img" aria-label={`Disk usage map for ${currentNode().name}`}>
            <circle cx={center} cy={center} r={innerRadius - 4} class="fill-neutral-950 stroke-neutral-800" />
            <For each={segments()}>
              {(segment, index) => (
                <path
                  d={arcPath(segment.startAngle, segment.endAngle, radiusForDepth(segment.depth), radiusForDepth(segment.depth + 1) - 5)}
                  fill={palette[index() % palette.length]}
                  class="cursor-pointer opacity-90 outline-none transition hover:opacity-100 focus:opacity-100"
                  tabIndex={0}
                  role="button"
                  aria-label={`${segment.node.name}, ${formatBytes(segment.node.logicalSize)}`}
                  onClick={() => {
                    if (segment.node.type === "directory" && segment.node.children.length > 0) {
                      setCurrentPath(segment.node.path);
                    }
                  }}
                  onKeyDown={(event) => {
                    if ((event.key === "Enter" || event.key === " ") && segment.node.type === "directory") {
                      event.preventDefault();
                      setCurrentPath(segment.node.path);
                    }
                  }}
                >
                  <title>
                    {segment.path}: {formatBytes(segment.node.logicalSize)}
                  </title>
                </path>
              )}
            </For>
          </svg>
          <div class="pointer-events-none absolute inset-0 flex items-center justify-center text-center">
            <div class="max-w-28">
              <p class="truncate text-xs text-neutral-500">{currentNode().name}</p>
              <p class="mt-1 text-xl font-semibold tabular-nums text-neutral-100">{formatBytes(currentNode().logicalSize)}</p>
            </div>
          </div>
        </div>
      </div>

      <div class="rounded-lg border border-neutral-800 bg-neutral-900">
        <div class="grid grid-cols-[minmax(0,1fr)_6rem] gap-3 border-b border-neutral-800 px-4 py-3 text-xs font-medium uppercase text-neutral-500">
          <span>Segment</span>
          <span class="text-right">Usage</span>
        </div>
        <ul>
          <For each={currentNode().children}>
            {(node, index) => (
              <li class="grid grid-cols-[minmax(0,1fr)_6rem] gap-3 border-b border-neutral-800 px-4 py-3 last:border-b-0">
                <div class="flex min-w-0 items-center gap-3">
                  <span
                    class="size-3 shrink-0 rounded-sm"
                    style={{ "background-color": palette[index() % palette.length] }}
                    aria-hidden="true"
                  />
                  <button
                    type="button"
                    class="min-w-0 truncate text-left text-sm font-medium text-neutral-100 hover:text-emerald-300 disabled:hover:text-neutral-100"
                    disabled={node.type !== "directory" || node.children.length === 0}
                    onClick={() => setCurrentPath(node.path)}
                  >
                    {node.name}
                  </button>
                </div>
                <span class="text-right text-sm tabular-nums text-neutral-300">{formatBytes(node.logicalSize)}</span>
              </li>
            )}
          </For>
        </ul>
      </div>
    </section>
  );
}

function buildSegments(root: ScanNode): Segment[] {
  const segments: Segment[] = [];
  addSegments(root.children, 0, Math.PI * 2, 0, root.logicalSize, segments, root.name);
  return segments;
}

function addSegments(
  nodes: ScanNode[],
  startAngle: number,
  endAngle: number,
  depth: number,
  totalSize: number,
  segments: Segment[],
  parentPath: string,
) {
  if (nodes.length === 0 || totalSize === 0 || depth > 2) return;

  let cursor = startAngle;
  for (const node of nodes) {
    const span = ((endAngle - startAngle) * node.logicalSize) / totalSize;
    const segmentStart = cursor + gapRadians;
    const segmentEnd = cursor + span - gapRadians;
    if (segmentEnd > segmentStart) {
      const segment = {
        node,
        path: `${parentPath}/${node.name}`,
        depth,
        startAngle: segmentStart,
        endAngle: segmentEnd,
      };
      segments.push(segment);
      addSegments(node.children, segmentStart, segmentEnd, depth + 1, node.logicalSize, segments, segment.path);
    }
    cursor += span;
  }
}

function arcPath(startAngle: number, endAngle: number, inner: number, outer: number): string {
  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
  const outerStart = polarToCartesian(outer, startAngle);
  const outerEnd = polarToCartesian(outer, endAngle);
  const innerEnd = polarToCartesian(inner, endAngle);
  const innerStart = polarToCartesian(inner, startAngle);

  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${outer} ${outer} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${inner} ${inner} 0 ${largeArc} 0 ${innerStart.x} ${innerStart.y}`,
    "Z",
  ].join(" ");
}

function polarToCartesian(radius: number, angle: number) {
  return {
    x: center + radius * Math.cos(angle - Math.PI / 2),
    y: center + radius * Math.sin(angle - Math.PI / 2),
  };
}

function radiusForDepth(depth: number): number {
  return innerRadius + depth * ringWidth;
}

function buildNodeIndex(root: ScanNode): Map<string, IndexedNode> {
  const index = new Map<string, IndexedNode>();
  const stack: Array<{ node: ScanNode; breadcrumbs: ScanNode[] }> = [
    { node: root, breadcrumbs: [root] },
  ];

  while (stack.length > 0) {
    const item = stack.pop();
    if (!item) continue;

    index.set(item.node.path, item);
    for (let childIndex = item.node.children.length - 1; childIndex >= 0; childIndex -= 1) {
      const child = item.node.children[childIndex];
      if (child) stack.push({ node: child, breadcrumbs: [...item.breadcrumbs, child] });
    }
  }

  return index;
}
