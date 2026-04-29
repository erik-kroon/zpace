import type { ScanLifecycleSnapshot, ScanNode, ScanResult } from "@zpace/scanner/src/schema";

export interface ScanSummaryItem {
  label: string;
  value: string;
}

export interface ScanRow {
  node: ScanNode;
  sizeLabel: string;
  childCountLabel: string | null;
}

export function summarizeScanResult(result: ScanResult): ScanSummaryItem[] {
  return [
    { label: "items", value: result.root.childCount.toString() },
    { label: "size", value: formatBytes(result.root.logicalSize) },
    { label: "status", value: result.root.status },
    { label: "warnings", value: result.diagnostics.length.toString() },
  ];
}

export function summarizeScanSnapshot(snapshot: ScanLifecycleSnapshot): ScanSummaryItem[] {
  return [
    { label: "paths", value: snapshot.progress.pathsScanned.toString() },
    { label: "files", value: snapshot.progress.filesScanned.toString() },
    { label: "size", value: snapshot.result ? formatBytes(snapshot.result.root.logicalSize) : "-" },
    { label: "warnings", value: snapshot.result?.diagnostics.length.toString() ?? "0" },
    { label: "state", value: snapshot.state },
  ];
}

export function createScanRows(root: ScanNode): ScanRow[] {
  return [root, ...root.children].map((node) => ({
    node,
    sizeLabel: formatBytes(node.logicalSize),
    childCountLabel: node.childCount > 0 ? `${node.childCount} children` : null,
  }));
}

export function formatBytes(bytes: number): string {
  if (bytes < 1_000) return `${bytes} B`;

  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1_000;
  let unitIndex = 0;

  while (value >= 1_000 && unitIndex < units.length - 1) {
    value /= 1_000;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}
