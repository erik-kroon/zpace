import {
  formatBytes,
  formatOptionalBytes,
} from "@zpace/scanner/src/presentation";
import type { ScanNode, ScanRiskLevel } from "@zpace/scanner/src/schema";

export {
  createScanReportViewModel,
  createScanWarningRows,
  formatBytes,
  getIncompleteScanMessage,
  summarizeScanResult,
  summarizeScanSnapshot,
  type ScanLabelValue as ScanSummaryItem,
  type ScanReportRow,
  type ScanReportViewModel,
  type ScanWarningRow,
} from "@zpace/scanner/src/presentation";

export interface ScanRow {
  node: ScanNode;
  sizeLabel: string;
  allocatedSizeLabel: string;
  childCountLabel: string | null;
}

export interface IndexedScanNode {
  node: ScanNode;
  breadcrumbs: ScanNode[];
}

export interface CleanupQueueItem {
  path: string;
  name: string;
  type: ScanNode["type"];
  logicalSize: number;
  sizeLabel: string;
  category: string;
  risk: ScanRiskLevel | null;
  recommendation: string | null;
  isProtected: boolean;
  protectionReason: string | null;
}

export interface CleanupQueueSummary {
  items: CleanupQueueItem[];
  totalSizeLabel: string;
  itemCountLabel: string;
  warning: string | null;
}

export interface CleanupExecutionItemResult {
  path: string;
  name: string;
  sizeLabel: string;
  status: "dry-run" | "moved" | "skipped" | "failed";
  message: string;
}

export interface CleanupExecutionResult {
  id: string;
  completedAt: string;
  dryRun: boolean;
  itemCountLabel: string;
  totalSizeLabel: string;
  status: "dry-run" | "complete" | "partial" | "failed";
  results: CleanupExecutionItemResult[];
}

export interface CleanupExecutionOptions {
  dryRun: boolean;
  trashAvailable: boolean;
  now?: Date;
  id?: string;
}

export function createScanRows(root: ScanNode): ScanRow[] {
  return [root, ...root.children].map((node) => ({
    node,
    sizeLabel: formatBytes(node.logicalSize),
    allocatedSizeLabel: formatOptionalBytes(node.allocatedSize),
    childCountLabel: formatChildCountLabel(node),
  }));
}

export function createChildScanRows(root: ScanNode): ScanRow[] {
  return root.children.map((node) => ({
    node,
    sizeLabel: formatBytes(node.logicalSize),
    allocatedSizeLabel: formatOptionalBytes(node.allocatedSize),
    childCountLabel: formatChildCountLabel(node),
  }));
}

export function buildScanNodeIndex(root: ScanNode): Map<string, IndexedScanNode> {
  const index = new Map<string, IndexedScanNode>();
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

export function createCleanupQueueItem(node: ScanNode): CleanupQueueItem {
  return {
    path: node.path,
    name: node.name,
    type: node.type,
    logicalSize: node.logicalSize,
    sizeLabel: formatBytes(node.logicalSize),
    category: node.classification?.category ?? "Unclassified",
    risk: node.classification?.risk ?? null,
    recommendation: node.classification?.recommendation ?? null,
    isProtected: node.classification?.isProtected ?? false,
    protectionReason: node.classification?.protectionReason ?? null,
  };
}

export function createCleanupQueueSummary(items: CleanupQueueItem[]): CleanupQueueSummary {
  const totalSize = items.reduce((sum, item) => sum + item.logicalSize, 0);
  const protectedCount = items.filter((item) => item.isProtected).length;
  const highRiskCount = items.filter((item) => item.risk === "high").length;

  return {
    items,
    totalSizeLabel: formatBytes(totalSize),
    itemCountLabel: `${items.length} ${items.length === 1 ? "item" : "items"}`,
    warning: createCleanupQueueWarning(protectedCount, highRiskCount),
  };
}

export function canMoveCleanupQueueToTrash(items: CleanupQueueItem[]): boolean {
  return items.length > 0 && items.every((item) => !item.isProtected);
}

export function createCleanupExecutionResult(
  items: CleanupQueueItem[],
  options: CleanupExecutionOptions,
): CleanupExecutionResult {
  const completedAt = (options.now ?? new Date()).toISOString();
  const results = items.map((item) => createCleanupExecutionItemResult(item, options));
  const movedCount = results.filter((result) => result.status === "moved").length;
  const failedCount = results.filter((result) => result.status === "failed").length;
  const skippedCount = results.filter((result) => result.status === "skipped").length;

  return {
    id: options.id ?? completedAt,
    completedAt,
    dryRun: options.dryRun,
    itemCountLabel: `${items.length} ${items.length === 1 ? "item" : "items"}`,
    totalSizeLabel: formatBytes(items.reduce((sum, item) => sum + item.logicalSize, 0)),
    status: getCleanupExecutionStatus(options.dryRun, movedCount, failedCount, skippedCount),
    results,
  };
}

function createCleanupQueueWarning(protectedCount: number, highRiskCount: number): string | null {
  if (protectedCount > 0) {
    return `${protectedCount} protected ${protectedCount === 1 ? "item needs" : "items need"} extra review before cleanup.`;
  }
  if (highRiskCount > 0) {
    return `${highRiskCount} high-risk ${highRiskCount === 1 ? "item is" : "items are"} queued.`;
  }
  return null;
}

function formatChildCountLabel(node: ScanNode): string | null {
  if (node.childCount === 0) return null;
  const childLabel = `${node.childCount} ${node.childCount === 1 ? "child" : "children"}`;
  if (!node.childrenTruncated) return childLabel;
  return `${childLabel}, showing ${node.children.length}`;
}

function createCleanupExecutionItemResult(
  item: CleanupQueueItem,
  options: CleanupExecutionOptions,
): CleanupExecutionItemResult {
  if (item.isProtected) {
    return {
      path: item.path,
      name: item.name,
      sizeLabel: item.sizeLabel,
      status: "skipped",
      message: item.protectionReason ?? "Protected paths are skipped by the normal cleanup flow.",
    };
  }

  if (options.dryRun) {
    return {
      path: item.path,
      name: item.name,
      sizeLabel: item.sizeLabel,
      status: "dry-run",
      message: "Dry run only. This item would be moved to Trash.",
    };
  }

  if (!options.trashAvailable) {
    return {
      path: item.path,
      name: item.name,
      sizeLabel: item.sizeLabel,
      status: "failed",
      message: "Move to Trash is not available in this browser preview.",
    };
  }

  return {
    path: item.path,
    name: item.name,
    sizeLabel: item.sizeLabel,
    status: "moved",
    message: "Moved to Trash.",
  };
}

function getCleanupExecutionStatus(
  dryRun: boolean,
  movedCount: number,
  failedCount: number,
  skippedCount: number,
): CleanupExecutionResult["status"] {
  if (dryRun) return "dry-run";
  if (failedCount > 0 && movedCount === 0) return "failed";
  if (failedCount > 0 || skippedCount > 0) return "partial";
  return "complete";
}
