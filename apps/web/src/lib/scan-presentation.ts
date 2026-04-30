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

export interface ScanSearchResult {
  node: ScanNode;
  score: number;
  matchedFields: string[];
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

export function getScanNodeChildren(node: ScanNode | null | undefined): ScanNode[] {
  return Array.isArray(node?.children) ? node.children : [];
}

export function getScanNodeName(node: ScanNode | null | undefined): string {
  return node?.name ?? node?.path ?? "Unknown item";
}

export function getScanNodePath(node: ScanNode | null | undefined): string {
  return node?.path ?? getScanNodeName(node);
}

export function getScanNodeSize(node: ScanNode | null | undefined): number {
  return Number.isFinite(node?.logicalSize) ? node?.logicalSize ?? 0 : 0;
}

export function formatRiskLabel(risk: ScanRiskLevel | null | undefined, isProtected = false): string {
  if (isProtected) return "Protected";
  if (risk === "low") return "Safe to clean";
  if (risk === "medium") return "Usually safe";
  if (risk === "high") return "Review first";
  return "Unknown";
}

export function createScanRows(root: ScanNode): ScanRow[] {
  return [root, ...getScanNodeChildren(root)].map((node) => ({
    node,
    sizeLabel: formatBytes(getScanNodeSize(node)),
    allocatedSizeLabel: formatOptionalBytes(node.allocatedSize ?? null),
    childCountLabel: formatChildCountLabel(node),
  }));
}

export function createChildScanRows(root: ScanNode): ScanRow[] {
  return getScanNodeChildren(root).map((node) => ({
    node,
    sizeLabel: formatBytes(getScanNodeSize(node)),
    allocatedSizeLabel: formatOptionalBytes(node.allocatedSize ?? null),
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

    index.set(getScanNodePath(item.node), item);
    const children = getScanNodeChildren(item.node);
    for (let childIndex = children.length - 1; childIndex >= 0; childIndex -= 1) {
      const child = children[childIndex];
      if (child) stack.push({ node: child, breadcrumbs: [...item.breadcrumbs, child] });
    }
  }

  return index;
}

export function searchScanNodes(root: ScanNode | null | undefined, query: string, limit = 12): ScanSearchResult[] {
  if (!root) return [];
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return [];

  const terms = normalizedQuery.split(" ").filter(Boolean);
  const results: ScanSearchResult[] = [];
  const stack = [root];

  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) continue;

    const match = scoreSearchNode(node, normalizedQuery, terms);
    if (match.score > 0) results.push({ node, ...match });
    stack.push(...getScanNodeChildren(node));
  }

  return results
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      const sizeDifference = getScanNodeSize(right.node) - getScanNodeSize(left.node);
      if (sizeDifference !== 0) return sizeDifference;
      return getScanNodeName(left.node).localeCompare(getScanNodeName(right.node));
    })
    .slice(0, limit);
}

export function createCleanupQueueItem(node: ScanNode): CleanupQueueItem {
  return {
    path: getScanNodePath(node),
    name: getScanNodeName(node),
    type: node.type ?? "other",
    logicalSize: getScanNodeSize(node),
    sizeLabel: formatBytes(getScanNodeSize(node)),
    category: node.classification?.category ?? "Unclassified",
    risk: node.classification?.risk ?? null,
    recommendation: node.classification?.recommendation ?? null,
    isProtected: node.classification?.isProtected ?? false,
    protectionReason: node.classification?.protectionReason ?? null,
  };
}

function scoreSearchNode(
  node: ScanNode,
  query: string,
  terms: string[],
): { score: number; matchedFields: string[] } {
  const fields = [
    { label: "name", value: getScanNodeName(node), exact: 120, prefix: 90, includes: 70 },
    { label: "path", value: getScanNodePath(node), exact: 80, prefix: 55, includes: 45 },
    { label: "category", value: node.classification?.category ?? "", exact: 60, prefix: 45, includes: 35 },
    { label: "recommendation", value: node.classification?.recommendation ?? "", exact: 30, prefix: 22, includes: 16 },
  ];
  let score = 0;
  const matchedFields = new Set<string>();

  for (const field of fields) {
    const value = normalizeSearchText(field.value);
    if (!value) continue;
    if (value === query) {
      score += field.exact;
      matchedFields.add(field.label);
      continue;
    }
    if (value.startsWith(query)) {
      score += field.prefix;
      matchedFields.add(field.label);
      continue;
    }
    if (value.includes(query)) {
      score += field.includes;
      matchedFields.add(field.label);
      continue;
    }

    const matchedTerms = terms.filter((term) => value.includes(term));
    if (matchedTerms.length > 0) {
      score += Math.round((field.includes * matchedTerms.length) / terms.length);
      matchedFields.add(field.label);
    }
  }

  if (score > 0 && node.type === "directory") score += 4;
  if (score > 0 && node.classification?.risk === "low") score += 2;
  return { score, matchedFields: [...matchedFields] };
}

function normalizeSearchText(value: string): string {
  return value.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

export function isRoutineCleanupTarget(node: ScanNode | null | undefined): boolean {
  const classification = node?.classification;
  if (!classification || classification.isProtected) return false;
  return classification.risk === "low" || classification.risk === "medium";
}

export function collectScopedCleanupTargets(root: ScanNode | null | undefined): ScanNode[] {
  if (!root) return [];
  const items: ScanNode[] = [];
  const stack = getScanNodeChildren(root).toReversed();

  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) continue;
    if (isRoutineCleanupTarget(node)) items.push(node);
    stack.push(...getScanNodeChildren(node).toReversed());
  }

  return items;
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
    return `${highRiskCount} ${highRiskCount === 1 ? "item needs" : "items need"} manual review before cleanup.`;
  }
  return null;
}

function formatChildCountLabel(node: ScanNode): string | null {
  const childCount = node.childCount ?? getScanNodeChildren(node).length;
  if (childCount === 0) return null;
  const childLabel = `${childCount} ${childCount === 1 ? "child" : "children"}`;
  if (!node.childrenTruncated) return childLabel;
  return `${childLabel}, showing ${getScanNodeChildren(node).length}`;
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
