import type {
  ScanDiagnostic,
  ScanLifecycleSnapshot,
  ScanResult,
  ScanSummaryItem as ScannerSummaryItem,
} from "./schema";

export interface ScanLabelValue {
  label: string;
  value: string;
}

export interface ScanWarningRow {
  diagnostic: ScanDiagnostic;
  title: string;
  detail: string;
}

export interface ScanReportRow {
  label: string;
  value: string;
  detail: string | null;
}

export interface ScanReportViewModel {
  metrics: ScanLabelValue[];
  largestItems: ScanReportRow[];
  categories: ScanReportRow[];
}

export function summarizeScanResult(result: ScanResult): ScanLabelValue[] {
  return [
    { label: "items", value: result.root.childCount.toString() },
    { label: "size", value: formatBytes(result.root.logicalSize) },
    { label: "status", value: result.root.status },
    { label: "warnings", value: result.diagnostics.length.toString() },
  ];
}

export function summarizeScanSnapshot(snapshot: ScanLifecycleSnapshot): ScanLabelValue[] {
  return [
    { label: "paths", value: snapshot.progress.pathsScanned.toString() },
    { label: "files", value: snapshot.progress.filesScanned.toString() },
    {
      label: "size",
      value: formatBytes(snapshot.result?.root.logicalSize ?? snapshot.progress.logicalSizeScanned),
    },
    { label: "warnings", value: snapshot.result?.diagnostics.length.toString() ?? "0" },
    { label: "state", value: snapshot.state },
  ];
}

export function getIncompleteScanMessage(result: ScanResult): string | null {
  if (result.root.status === "complete" && result.diagnostics.length === 0) return null;

  const inaccessibleCount = result.diagnostics.filter((item) => item.kind === "inaccessible").length;
  const skippedCount = result.diagnostics.filter((item) => item.kind === "skipped").length;
  const parts = [];
  if (inaccessibleCount > 0) parts.push(`${inaccessibleCount} inaccessible`);
  if (skippedCount > 0) parts.push(`${skippedCount} skipped`);

  const suffix = parts.length > 0 ? `: ${parts.join(", ")}` : "";
  return `Scan incomplete${suffix}. Reported sizes include scanned space only.`;
}

export function createScanWarningRows(result: ScanResult): ScanWarningRow[] {
  return result.diagnostics.map((diagnostic) => ({
    diagnostic,
    title: `${diagnostic.kind} ${diagnostic.severity}`,
    detail: formatDiagnosticDetail(diagnostic),
  }));
}

export function createScanReportViewModel(result: ScanResult): ScanReportViewModel {
  return {
    metrics: [
      { label: "scanned", value: formatBytes(result.summary.totalLogicalSize) },
      { label: "allocated", value: formatOptionalBytes(result.summary.totalAllocatedSize) },
      { label: "reclaimable", value: formatBytes(result.summary.likelyReclaimableSize) },
      { label: "files", value: result.summary.fileCount.toString() },
      { label: "folders", value: result.summary.folderCount.toString() },
      { label: "inaccessible", value: result.summary.inaccessibleCount.toString() },
      { label: "skipped", value: result.summary.skippedCount.toString() },
      { label: "protected", value: result.summary.protectedCount.toString() },
      { label: "free", value: formatUnavailableBytes(result.summary.freeSize) },
      { label: "purgeable", value: formatUnavailableBytes(result.summary.purgeableSize) },
      { label: "duration", value: formatDuration(result.summary.durationMs) },
    ],
    largestItems: result.summary.largestItems.map(createLargestItemRow),
    categories: result.summary.categories.map((category) => ({
      label: category.category,
      value: formatBytes(category.logicalSize),
      detail: `${category.itemCount} items, ${formatBytes(category.likelyReclaimableSize)} likely reclaimable`,
    })),
  };
}

export function formatDiagnosticDetail(diagnostic: ScanDiagnostic): string {
  return diagnostic.guidance
    ? `${diagnostic.message}. ${diagnostic.guidance}`
    : diagnostic.message;
}

export function formatOptionalBytes(bytes: number | null): string {
  return bytes === null ? "-" : formatBytes(bytes);
}

export function formatUnavailableBytes(bytes: number | null): string {
  return bytes === null ? "unavailable" : formatBytes(bytes);
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

export function formatDuration(durationMs: number): string {
  if (durationMs < 1_000) return `${durationMs} ms`;
  return `${(durationMs / 1_000).toFixed(durationMs >= 10_000 ? 0 : 1)} s`;
}

function createLargestItemRow(item: ScannerSummaryItem): ScanReportRow {
  return {
    label: item.name,
    value: formatBytes(item.logicalSize),
    detail: item.classification ? formatClassificationLabel(item.classification) : item.path,
  };
}

function formatClassificationLabel(classification: NonNullable<ScannerSummaryItem["classification"]>): string {
  return classification.isProtected
    ? `${classification.category}, protected`
    : classification.category;
}
