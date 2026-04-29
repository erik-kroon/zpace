import type { ScanDiagnostic, ScanResult } from "./schema";
import {
  createScanReportViewModel,
  formatBytes,
  formatDiagnosticDetail,
  formatDuration,
  formatOptionalBytes,
  formatUnavailableBytes,
} from "./presentation";

export function formatHumanScanResult(result: ScanResult): string {
  const report = createScanReportViewModel(result);
  const lines = [
    `Scan ${result.root.status}: ${result.root.path}`,
    `Scanned size: ${formatBytes(result.summary.totalLogicalSize)}`,
    `Allocated size: ${formatOptionalBytes(result.summary.totalAllocatedSize)}`,
    `Likely reclaimable: ${formatBytes(result.summary.likelyReclaimableSize)}`,
    `Files: ${result.summary.fileCount}`,
    `Folders: ${result.summary.folderCount}`,
    `Inaccessible paths: ${result.summary.inaccessibleCount}`,
    `Skipped paths: ${result.summary.skippedCount}`,
    `Protected paths: ${result.summary.protectedCount}`,
    `Free space: ${formatUnavailableBytes(result.summary.freeSize)}`,
    `Purgeable space: ${formatUnavailableBytes(result.summary.purgeableSize)}`,
    `Duration: ${formatDuration(result.summary.durationMs)}`,
  ];

  if (report.largestItems.length > 0) {
    lines.push("Largest items:");
    for (const item of result.summary.largestItems.slice(0, 5)) {
      const category = item.classification
        ? ` (${item.classification.isProtected ? `${item.classification.category}, protected` : item.classification.category})`
        : "";
      lines.push(`- ${formatBytes(item.logicalSize)} ${item.path}${category}`);
    }
  }

  if (report.categories.length > 0) {
    lines.push("Category breakdown:");
    for (const category of report.categories) {
      lines.push(`- ${category.label}: ${category.value} across ${category.detail}`);
    }
  }

  if (result.diagnostics.length === 0) {
    lines.push("Warnings: none");
    return `${lines.join("\n")}\n`;
  }

  lines.push(`Warnings: ${result.diagnostics.length}`);
  for (const diagnostic of result.diagnostics) {
    lines.push(formatDiagnostic(diagnostic));
  }

  return `${lines.join("\n")}\n`;
}

export function formatDiagnostic(diagnostic: ScanDiagnostic): string {
  return `- ${diagnostic.severity} ${diagnostic.kind}: ${diagnostic.path} - ${formatDiagnosticDetail(diagnostic)}`;
}
