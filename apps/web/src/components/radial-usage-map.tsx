import type { ScanNode } from "@zpace/scanner/src/schema";
import { ChevronRight } from "lucide-solid";
import { createMemo, createSignal, For, Show } from "solid-js";

import {
  formatBytes,
  getScanNodeChildren,
  getScanNodeName,
  getScanNodePath,
  getScanNodeSize,
} from "@/lib/scan-presentation";

interface RadialUsageMapProps {
  root: ScanNode;
  viewPath: string;
  selectedPath?: string | null;
  highlightedPath?: string | null;
  onSelect?: (node: ScanNode) => void;
  onHighlight?: (node: ScanNode | null) => void;
  onViewChange?: (node: ScanNode) => void;
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

const viewBoxSize = 360;
const center = viewBoxSize / 2;
const innerRadius = 43;
const ringWidth = 32;
const ringGap = 1;
const gapRadians = 0.0015;
const palette = ["#34d399", "#60a5fa", "#f59e0b", "#c084fc", "#5eead4", "#f472b6", "#94a3b8"];

export function getRadialNodeColor(index: number): string {
  return palette[index % palette.length] ?? palette[0];
}

export function RadialUsageMap(props: RadialUsageMapProps) {
  const [hoveredNode, setHoveredNode] = createSignal<ScanNode | null>(null);
  const [tooltipPosition, setTooltipPosition] = createSignal({ x: 16, y: 16 });
  const nodeIndex = createMemo(() => buildNodeIndex(props.root));
  const currentNode = createMemo(() => nodeIndex().get(props.viewPath)?.node ?? props.root);
  const breadcrumbs = createMemo(
    () => nodeIndex().get(getScanNodePath(currentNode()))?.breadcrumbs ?? [props.root],
  );
  const segments = createMemo(() => buildSegments(currentNode()));

  const selectNode = (node: ScanNode) => {
    props.onSelect?.(node);
    if (node.type === "directory" && getScanNodeChildren(node).length > 0) {
      props.onViewChange?.(node);
    }
  };

  const viewNodeLabel = createMemo(() => ({
    name: getScanNodeName(currentNode()),
    size: formatBytes(getScanNodeSize(currentNode())),
  }));

  return (
    <section class="min-h-0 min-w-0">
      <div class="flex h-full min-h-0 flex-col rounded-lg border border-white/10 bg-[#172033] p-5 shadow-2xl shadow-black/20">
        <div class="shrink-0 flex items-start justify-between gap-3">
          <div>
            <h2 class="text-sm font-semibold text-slate-50">Space map</h2>
          <p class="mt-1 text-xs text-slate-400">Click a folder segment to drill in. Hover for item details.</p>
          </div>
          <span class="rounded-md border border-white/10 px-2 py-1 text-xs text-slate-300">
            {getScanNodeChildren(currentNode()).length} items
          </span>
        </div>

        <nav class="mt-3 flex min-w-0 shrink-0 flex-wrap items-center gap-1 text-xs" aria-label="Folder breadcrumb">
          <For each={breadcrumbs()}>
            {(node, index) => (
              <>
                <Show when={index() > 0}>
                  <ChevronRight size={13} class="text-neutral-600" aria-hidden="true" />
                </Show>
                <button
                  type="button"
                  class="max-w-40 truncate rounded-md px-2 py-1 text-slate-400 hover:bg-white/10 hover:text-slate-50"
                  aria-current={getScanNodePath(node) === getScanNodePath(currentNode()) ? "page" : undefined}
                  onClick={() => props.onViewChange?.(node)}
                >
                  {getScanNodeName(node)}
                </button>
              </>
            )}
          </For>
        </nav>

        <div class="relative mx-auto mt-3 flex aspect-square min-h-0 w-full min-w-0 max-w-[min(100%,46rem,calc(100vh-11rem))] flex-1 items-center justify-center overflow-hidden">
          <svg
            class="block h-full max-h-full w-full max-w-full"
            viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`}
            role="img"
            aria-label={`Disk usage map for ${getScanNodeName(currentNode())}`}
          >
            <desc>{segments().map((segment) => segment.path).join(", ")}</desc>
            <circle cx={center} cy={center} r={innerRadius - 4} class="fill-[#101827] stroke-white/10" />
            <For each={segments()}>
              {(segment, index) => (
                <path
                  d={arcPath(
                    segment.startAngle,
                    segment.endAngle,
                    radiusForDepth(segment.depth),
                    radiusForDepth(segment.depth + 1) - ringGap,
                  )}
                  fill={getRadialNodeColor(index())}
                  class={`cursor-pointer opacity-65 outline-none transition duration-150 hover:opacity-100 hover:drop-shadow-[0_0_10px_rgba(94,234,212,0.35)] focus:opacity-100 focus-visible:stroke-slate-50 focus-visible:stroke-2 ${props.selectedPath === getScanNodePath(segment.node) || props.highlightedPath === getScanNodePath(segment.node) ? "stroke-cyan-100 stroke-2 opacity-100 drop-shadow-[0_0_12px_rgba(94,234,212,0.28)]" : ""}`}
                  tabIndex={0}
                  role="button"
                  aria-label={`${getScanNodeName(segment.node)}, ${formatBytes(getScanNodeSize(segment.node))}`}
                  onClick={() => selectNode(segment.node)}
                  onMouseEnter={(event) => {
                    setTooltipPosition(getTooltipPosition(event.currentTarget.ownerSVGElement, event.clientX, event.clientY));
                    setHoveredNode(segment.node);
                    props.onHighlight?.(segment.node);
                  }}
                  onMouseMove={(event) => {
                    setTooltipPosition(getTooltipPosition(event.currentTarget.ownerSVGElement, event.clientX, event.clientY));
                  }}
                  onMouseLeave={() => {
                    setHoveredNode(null);
                    props.onHighlight?.(null);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      selectNode(segment.node);
                    }
                  }}
                />
              )}
            </For>
          </svg>
          <div class="pointer-events-none absolute inset-0 flex items-center justify-center text-center">
            <div class="max-w-28">
              <p class="truncate text-xs text-slate-400">{viewNodeLabel().name}</p>
              <p class="mt-1 text-xl font-semibold tabular-nums text-slate-50">{viewNodeLabel().size}</p>
            </div>
          </div>
          <Show when={hoveredNode()}>
            {(node) => (
              <div
                class="pointer-events-none absolute max-w-56 rounded-md border border-white/10 bg-[#101827]/95 px-3 py-2 shadow-xl"
                style={{
                  left: `${tooltipPosition().x}px`,
                  top: `${tooltipPosition().y}px`,
                }}
              >
                <p class="truncate text-xs font-medium text-slate-100">{getScanNodeName(node())}</p>
                <p class="mt-1 text-xs tabular-nums text-slate-400">{formatBytes(getScanNodeSize(node()))}</p>
              </div>
            )}
          </Show>
        </div>
      </div>
    </section>
  );
}

function getTooltipPosition(svg: SVGSVGElement | null, clientX: number, clientY: number) {
  const bounds = svg?.parentElement?.getBoundingClientRect();
  if (!bounds) return { x: 16, y: 16 };

  const offset = 14;
  const tooltipWidth = 224;
  const tooltipHeight = 58;
  const maxX = Math.max(8, bounds.width - tooltipWidth - 8);
  const maxY = Math.max(8, bounds.height - tooltipHeight - 8);
  const x = Math.min(Math.max(clientX - bounds.left + offset, 8), maxX);
  const y = Math.min(Math.max(clientY - bounds.top + offset, 8), maxY);

  return { x, y };
}

function buildSegments(root: ScanNode): Segment[] {
  const segments: Segment[] = [];
  addSegments(getScanNodeChildren(root), 0, Math.PI * 2, 0, getScanNodeSize(root), segments, getScanNodeName(root));
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
  if (!Array.isArray(nodes) || nodes.length === 0 || totalSize === 0 || depth > 3) return;

  let cursor = startAngle;
  for (const node of nodes) {
    const nodeSize = getScanNodeSize(node);
    const span = ((endAngle - startAngle) * nodeSize) / totalSize;
    const segmentStart = cursor + gapRadians;
    const segmentEnd = cursor + span - gapRadians;
    if (segmentEnd > segmentStart) {
      const segment = {
        node,
        path: `${parentPath}/${getScanNodeName(node)}`,
        depth,
        startAngle: segmentStart,
        endAngle: segmentEnd,
      };
      segments.push(segment);
      addSegments(getScanNodeChildren(node), segmentStart, segmentEnd, depth + 1, nodeSize, segments, segment.path);
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

    index.set(getScanNodePath(item.node), item);
    const children = getScanNodeChildren(item.node);
    for (let childIndex = children.length - 1; childIndex >= 0; childIndex -= 1) {
      const child = children[childIndex];
      if (child) stack.push({ node: child, breadcrumbs: [...item.breadcrumbs, child] });
    }
  }

  return index;
}
