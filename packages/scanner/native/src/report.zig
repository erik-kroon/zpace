const std = @import("std");

const classification = @import("classification.zig");

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
    status: ScanStatus,
    classification: ?classification.Classification,
    children: std.ArrayListUnmanaged(Node),
};

pub const SummaryItem = struct {
    path: []const u8,
    name: []const u8,
    item_type: ItemType,
    logical_size: u64,
    classification: ?classification.Classification,
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
    scan_report.summary.largest_items.deinit(allocator);
    scan_report.summary.categories.deinit(allocator);
    freeNode(allocator, &scan_report.root);
    for (scan_report.diagnostics.items) |diagnostic| {
        allocator.free(diagnostic.path);
        allocator.free(diagnostic.message);
        if (diagnostic.guidance) |guidance| allocator.free(guidance);
    }
    scan_report.diagnostics.deinit(allocator);
}

pub fn buildSummary(
    allocator: std.mem.Allocator,
    root: *const Node,
    diagnostics: []const Diagnostic,
    duration_ms: u64,
) !ScanSummary {
    var summary = ScanSummary{
        .total_logical_size = root.logical_size,
        .total_allocated_size = null,
        .likely_reclaimable_size = 0,
        .file_count = 0,
        .folder_count = 0,
        .warning_count = 0,
        .inaccessible_count = 0,
        .skipped_count = 0,
        .protected_count = 0,
        .free_size = null,
        .purgeable_size = null,
        .duration_ms = duration_ms,
        .largest_items = .empty,
        .categories = .empty,
    };
    errdefer summary.largest_items.deinit(allocator);
    errdefer summary.categories.deinit(allocator);

    for (diagnostics) |diagnostic| {
        if (diagnostic.severity == .warning) summary.warning_count += 1;
        if (diagnostic.kind == .inaccessible) summary.inaccessible_count += 1;
        if (diagnostic.kind == .skipped) summary.skipped_count += 1;
    }

    try collectSummary(allocator, &summary, root, true);
    std.mem.sort(SummaryItem, summary.largest_items.items, {}, largerSummaryItem);
    if (summary.largest_items.items.len > 10) {
        summary.largest_items.shrinkRetainingCapacity(10);
    }

    return summary;
}

pub fn freeNode(allocator: std.mem.Allocator, node: *Node) void {
    for (node.children.items) |*child| {
        freeNode(allocator, child);
    }
    node.children.deinit(allocator);
    allocator.free(node.path);
    allocator.free(node.name);
}

pub fn writeReport(writer: anytype, scan_report: ScanReport) !void {
    try writer.writeAll("{\"schemaVersion\":1,\"root\":");
    try writeNode(writer, scan_report.root);
    try writer.writeAll(",\"summary\":");
    try writeSummary(writer, scan_report.summary);
    try writer.writeAll(",\"diagnostics\":[");
    for (scan_report.diagnostics.items, 0..) |diagnostic, index| {
        if (index > 0) try writer.writeByte(',');
        try writeDiagnostic(writer, diagnostic);
    }
    try writer.writeAll("]}\n");
}

fn collectSummary(
    allocator: std.mem.Allocator,
    summary: *ScanSummary,
    node: *const Node,
    is_root: bool,
) !void {
    if (node.item_type == .file) summary.file_count += 1;
    if (node.item_type == .directory) summary.folder_count += 1;
    if (node.allocated_size) |size| {
        summary.total_allocated_size = (summary.total_allocated_size orelse 0) + size;
    }

    if (!is_root) {
        try summary.largest_items.append(allocator, .{
            .path = node.path,
            .name = node.name,
            .item_type = node.item_type,
            .logical_size = node.logical_size,
            .classification = node.classification,
        });
    }

    if (node.classification) |node_classification| {
        if (node_classification.is_protected) summary.protected_count += 1;
        const reclaimable_size = if (node_classification.risk == .low) node.logical_size else 0;
        summary.likely_reclaimable_size += reclaimable_size;
        try addCategorySize(
            allocator,
            &summary.categories,
            node_classification.category,
            node.logical_size,
            reclaimable_size,
        );
    }

    for (node.children.items) |*child| {
        try collectSummary(allocator, summary, child, false);
    }
}

fn addCategorySize(
    allocator: std.mem.Allocator,
    categories: *std.ArrayListUnmanaged(CategorySummary),
    category: []const u8,
    logical_size: u64,
    reclaimable_size: u64,
) !void {
    for (categories.items) |*item| {
        if (std.mem.eql(u8, item.category, category)) {
            item.logical_size += logical_size;
            item.item_count += 1;
            item.likely_reclaimable_size += reclaimable_size;
            return;
        }
    }

    try categories.append(allocator, .{
        .category = category,
        .logical_size = logical_size,
        .item_count = 1,
        .likely_reclaimable_size = reclaimable_size,
    });
}

fn largerSummaryItem(_: void, left: SummaryItem, right: SummaryItem) bool {
    if (left.logical_size == right.logical_size) {
        return std.mem.lessThan(u8, left.name, right.name);
    }
    return left.logical_size > right.logical_size;
}

fn writeSummary(writer: anytype, summary: ScanSummary) !void {
    try writer.print(
        "{{\"totalLogicalSize\":{},\"totalAllocatedSize\":",
        .{summary.total_logical_size},
    );
    if (summary.total_allocated_size) |size| {
        try writer.print("{}", .{size});
    } else {
        try writer.writeAll("null");
    }
    try writer.print(
        ",\"likelyReclaimableSize\":{},\"fileCount\":{},\"folderCount\":{},\"warningCount\":{},\"inaccessibleCount\":{},\"skippedCount\":{},\"protectedCount\":{},\"freeSize\":",
        .{
            summary.likely_reclaimable_size,
            summary.file_count,
            summary.folder_count,
            summary.warning_count,
            summary.inaccessible_count,
            summary.skipped_count,
            summary.protected_count,
        },
    );
    if (summary.free_size) |size| {
        try writer.print("{}", .{size});
    } else {
        try writer.writeAll("null");
    }
    try writer.writeAll(",\"purgeableSize\":");
    if (summary.purgeable_size) |size| {
        try writer.print("{}", .{size});
    } else {
        try writer.writeAll("null");
    }
    try writer.print(",\"durationMs\":{},\"largestItems\":[", .{summary.duration_ms});
    for (summary.largest_items.items, 0..) |item, index| {
        if (index > 0) try writer.writeByte(',');
        try writeSummaryItem(writer, item);
    }
    try writer.writeAll("],\"categories\":[");
    for (summary.categories.items, 0..) |category, index| {
        if (index > 0) try writer.writeByte(',');
        try writeCategorySummary(writer, category);
    }
    try writer.writeAll("]}");
}

fn writeSummaryItem(writer: anytype, item: SummaryItem) !void {
    try writer.writeAll("{\"path\":");
    try writeJsonString(writer, item.path);
    try writer.writeAll(",\"name\":");
    try writeJsonString(writer, item.name);
    try writer.writeAll(",\"type\":");
    try writeJsonString(writer, @tagName(item.item_type));
    try writer.print(",\"logicalSize\":{},\"classification\":", .{item.logical_size});
    if (item.classification) |item_classification| {
        try writeClassification(writer, item_classification);
    } else {
        try writer.writeAll("null");
    }
    try writer.writeAll("}");
}

fn writeCategorySummary(writer: anytype, category: CategorySummary) !void {
    try writer.writeAll("{\"category\":");
    try writeJsonString(writer, category.category);
    try writer.print(
        ",\"logicalSize\":{},\"itemCount\":{},\"likelyReclaimableSize\":{}",
        .{ category.logical_size, category.item_count, category.likely_reclaimable_size },
    );
    try writer.writeAll("}");
}

fn writeNode(writer: anytype, node: Node) !void {
    try writer.writeAll("{\"path\":");
    try writeJsonString(writer, node.path);
    try writer.writeAll(",\"name\":");
    try writeJsonString(writer, node.name);
    try writer.writeAll(",\"type\":");
    try writeJsonString(writer, @tagName(node.item_type));
    try writer.print(",\"logicalSize\":{},\"allocatedSize\":", .{node.logical_size});
    if (node.allocated_size) |size| {
        try writer.print("{}", .{size});
    } else {
        try writer.writeAll("null");
    }
    try writer.print(",\"childCount\":{},\"status\":", .{node.child_count});
    try writeJsonString(writer, statusName(node.status));
    try writer.writeAll(",\"classification\":");
    if (node.classification) |node_classification| {
        try writeClassification(writer, node_classification);
    } else {
        try writer.writeAll("null");
    }
    try writer.writeAll(",\"children\":[");
    for (node.children.items, 0..) |child, index| {
        if (index > 0) try writer.writeByte(',');
        try writeNode(writer, child);
    }
    try writer.writeAll("]}");
}

fn writeClassification(writer: anytype, node_classification: classification.Classification) !void {
    try writer.writeAll("{\"category\":");
    try writeJsonString(writer, node_classification.category);
    try writer.writeAll(",\"explanation\":");
    try writeJsonString(writer, node_classification.explanation);
    try writer.writeAll(",\"risk\":");
    try writeJsonString(writer, @tagName(node_classification.risk));
    try writer.writeAll(",\"recommendation\":");
    try writeJsonString(writer, node_classification.recommendation);
    try writer.print(",\"isProtected\":{}", .{node_classification.is_protected});
    try writer.writeAll(",\"protectionReason\":");
    if (node_classification.protection_reason) |reason| {
        try writeJsonString(writer, reason);
    } else {
        try writer.writeAll("null");
    }
    try writer.writeAll("}");
}

fn writeDiagnostic(writer: anytype, diagnostic: Diagnostic) !void {
    try writer.writeAll("{\"path\":");
    try writeJsonString(writer, diagnostic.path);
    try writer.writeAll(",\"kind\":");
    try writeJsonString(writer, @tagName(diagnostic.kind));
    try writer.writeAll(",\"severity\":");
    try writeJsonString(writer, @tagName(diagnostic.severity));
    try writer.writeAll(",\"message\":");
    try writeJsonString(writer, diagnostic.message);
    try writer.writeAll(",\"guidance\":");
    if (diagnostic.guidance) |guidance| {
        try writeJsonString(writer, guidance);
    } else {
        try writer.writeAll("null");
    }
    try writer.writeAll("}");
}

pub fn writeJsonString(writer: anytype, value: []const u8) !void {
    try writer.writeByte('"');
    for (value) |char| {
        switch (char) {
            '"' => try writer.writeAll("\\\""),
            '\\' => try writer.writeAll("\\\\"),
            '\n' => try writer.writeAll("\\n"),
            '\r' => try writer.writeAll("\\r"),
            '\t' => try writer.writeAll("\\t"),
            else => {
                if (char < 0x20) {
                    try writer.print("\\u{x:0>4}", .{char});
                } else {
                    try writer.writeByte(char);
                }
            },
        }
    }
    try writer.writeByte('"');
}

fn statusName(status: ScanStatus) []const u8 {
    return switch (status) {
        .complete => "complete",
        .partial => "partial",
        .failed => "error",
    };
}
