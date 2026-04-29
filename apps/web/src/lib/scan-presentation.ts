import {
  formatBytes,
  formatOptionalBytes,
} from "@zpace/scanner/src/presentation";
import type { ScanNode } from "@zpace/scanner/src/schema";

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

export function createScanRows(root: ScanNode): ScanRow[] {
  return [root, ...root.children].map((node) => ({
    node,
    sizeLabel: formatBytes(node.logicalSize),
    allocatedSizeLabel: formatOptionalBytes(node.allocatedSize),
    childCountLabel: node.childCount > 0 ? `${node.childCount} children` : null,
  }));
}

export function createChildScanRows(root: ScanNode): ScanRow[] {
  return root.children.map((node) => ({
    node,
    sizeLabel: formatBytes(node.logicalSize),
    allocatedSizeLabel: formatOptionalBytes(node.allocatedSize),
    childCountLabel: node.childCount > 0 ? `${node.childCount} children` : null,
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
