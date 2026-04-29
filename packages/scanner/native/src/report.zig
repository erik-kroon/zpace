const std = @import("std");

const scan_policy = @import("scan_policy.zig");

pub const ItemType = enum { file, directory, symlink, other };
pub const ScanStatus = enum { complete, partial, failed };
pub const DiagnosticKind = enum { inaccessible, skipped };
pub const DiagnosticSeverity = enum { warning, @"error" };

pub const Diagnostic = struct {
    path: []const u8,
    kind: DiagnosticKind,
    severity: DiagnosticSeverity,
    message: []const u8,
    guidance: ?[]const u8,
};

pub const Node = struct {
    path: []const u8,
    name: []const u8,
    item_type: ItemType,
    logical_size: u64,
    allocated_size: ?u64,
    child_count: u64,
    omitted_child_count: u64,
    status: ScanStatus,
    classification: ?scan_policy.Classification,
    children: std.ArrayListUnmanaged(Node),
};

pub const SummaryItem = struct {
    path: []const u8,
    name: []const u8,
    item_type: ItemType,
    logical_size: u64,
    classification: ?scan_policy.Classification,
};

pub const CategorySummary = struct {
    category: []const u8,
    logical_size: u64,
    item_count: u64,
    likely_reclaimable_size: u64,
};

pub const ScanSummary = struct {
    total_logical_size: u64,
    total_allocated_size: ?u64,
    likely_reclaimable_size: u64,
    file_count: u64,
    folder_count: u64,
    warning_count: u64,
    inaccessible_count: u64,
    skipped_count: u64,
    protected_count: u64,
    free_size: ?u64,
    purgeable_size: ?u64,
    duration_ms: u64,
    largest_items: std.ArrayListUnmanaged(SummaryItem),
    categories: std.ArrayListUnmanaged(CategorySummary),
};

pub const ScanReport = struct {
    root: Node,
    diagnostics: std.ArrayListUnmanaged(Diagnostic),
    summary: ScanSummary,
};

pub fn freeReport(allocator: std.mem.Allocator, scan_report: *ScanReport) void {
    freeSummary(allocator, &scan_report.summary);
    freeNode(allocator, &scan_report.root);
    for (scan_report.diagnostics.items) |diagnostic| {
        allocator.free(diagnostic.path);
        allocator.free(diagnostic.message);
        if (diagnostic.guidance) |guidance| allocator.free(guidance);
    }
    scan_report.diagnostics.deinit(allocator);
}

pub fn freeSummary(allocator: std.mem.Allocator, summary: *ScanSummary) void {
    for (summary.largest_items.items) |*item| {
        freeSummaryItem(allocator, item);
    }
    summary.largest_items.deinit(allocator);
    summary.categories.deinit(allocator);
}

pub fn freeNode(allocator: std.mem.Allocator, node: *Node) void {
    for (node.children.items) |*child| {
        freeNode(allocator, child);
    }
    node.children.deinit(allocator);
    allocator.free(node.path);
    allocator.free(node.name);
}

fn freeSummaryItem(allocator: std.mem.Allocator, item: *SummaryItem) void {
    allocator.free(item.path);
    allocator.free(item.name);
}
