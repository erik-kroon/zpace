import { z } from "zod";

export const scanItemTypeSchema = z.enum(["file", "directory", "symlink", "other"]);
export type ScanItemType = z.infer<typeof scanItemTypeSchema>;

export const scanStatusSchema = z.enum(["complete", "partial", "error"]);
export type ScanStatus = z.infer<typeof scanStatusSchema>;

export const scanRiskLevelSchema = z.enum(["low", "medium", "high"]);
export type ScanRiskLevel = z.infer<typeof scanRiskLevelSchema>;

export const scanClassificationSchema = z.object({
  category: z.string(),
  explanation: z.string(),
  risk: scanRiskLevelSchema,
  recommendation: z.string(),
  isProtected: z.boolean().default(false),
  protectionReason: z.string().nullable().default(null),
});
export type ScanClassification = z.infer<typeof scanClassificationSchema>;

export const scanSummaryItemSchema = z.object({
  path: z.string(),
  name: z.string(),
  type: scanItemTypeSchema,
  logicalSize: z.number().int().nonnegative(),
  classification: scanClassificationSchema.nullable().default(null),
});
export type ScanSummaryItem = z.infer<typeof scanSummaryItemSchema>;

export const scanCategorySummarySchema = z.object({
  category: z.string(),
  logicalSize: z.number().int().nonnegative(),
  itemCount: z.number().int().nonnegative(),
  likelyReclaimableSize: z.number().int().nonnegative(),
});
export type ScanCategorySummary = z.infer<typeof scanCategorySummarySchema>;

export const scanReportSummarySchema = z.object({
  totalLogicalSize: z.number().int().nonnegative(),
  totalAllocatedSize: z.number().int().nonnegative().nullable(),
  likelyReclaimableSize: z.number().int().nonnegative(),
  fileCount: z.number().int().nonnegative(),
  folderCount: z.number().int().nonnegative(),
  warningCount: z.number().int().nonnegative(),
  inaccessibleCount: z.number().int().nonnegative().default(0),
  skippedCount: z.number().int().nonnegative().default(0),
  protectedCount: z.number().int().nonnegative().default(0),
  freeSize: z.number().int().nonnegative().nullable().default(null),
  purgeableSize: z.number().int().nonnegative().nullable().default(null),
  durationMs: z.number().int().nonnegative(),
  largestItems: z.array(scanSummaryItemSchema),
  categories: z.array(scanCategorySummarySchema),
});
export type ScanReportSummary = z.infer<typeof scanReportSummarySchema>;

export const scanNodeSchema: z.ZodType<ScanNode> = z.lazy(() =>
  z.object({
    path: z.string(),
    name: z.string(),
    type: scanItemTypeSchema,
    logicalSize: z.number().int().nonnegative(),
    allocatedSize: z.number().int().nonnegative().nullable(),
    childCount: z.number().int().nonnegative(),
    status: scanStatusSchema,
    classification: scanClassificationSchema.nullable().default(null),
    children: z.array(scanNodeSchema),
  }),
);

export interface ScanNode {
  path: string;
  name: string;
  type: ScanItemType;
  logicalSize: number;
  allocatedSize: number | null;
  childCount: number;
  status: ScanStatus;
  classification: ScanClassification | null;
  children: ScanNode[];
}

export const scanResultSchema = z.object({
  schemaVersion: z.literal(1),
  root: scanNodeSchema,
  summary: scanReportSummarySchema,
  diagnostics: z
    .array(
      z.object({
        path: z.string(),
        kind: z.enum(["inaccessible", "skipped"]),
        severity: z.enum(["warning", "error"]),
        message: z.string(),
        guidance: z.string().nullable().default(null),
      }),
    )
    .default([]),
});

export type ScanResult = z.infer<typeof scanResultSchema>;
export type ScanDiagnostic = ScanResult["diagnostics"][number];

export const scanLifecycleStateSchema = z.enum([
  "idle",
  "starting",
  "running",
  "complete",
  "cancelled",
  "error",
]);
export type ScanLifecycleState = z.infer<typeof scanLifecycleStateSchema>;

export const scanProgressSchema = z.object({
  pathsScanned: z.number().int().nonnegative(),
  directoriesScanned: z.number().int().nonnegative(),
  filesScanned: z.number().int().nonnegative(),
  currentPath: z.string().nullable(),
});
export type ScanProgress = z.infer<typeof scanProgressSchema>;

export const scanLifecycleEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("started"),
    path: z.string(),
  }),
  z.object({
    type: z.literal("progress"),
    progress: scanProgressSchema,
  }),
  z.object({
    type: z.literal("completed"),
    progress: scanProgressSchema,
  }),
]);
export type ScanLifecycleEvent = z.infer<typeof scanLifecycleEventSchema>;

export const initialScanProgress = {
  pathsScanned: 0,
  directoriesScanned: 0,
  filesScanned: 0,
  currentPath: null,
} satisfies ScanProgress;

export interface ScanLifecycleSnapshot {
  state: ScanLifecycleState;
  progress: ScanProgress;
  result: ScanResult | null;
  error: string | null;
}
