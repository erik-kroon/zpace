const std = @import("std");

const report = @import("report.zig");
const scan_policy = @import("scan_policy.zig");

pub fn initSummary() report.ScanSummary {
    return .{
        .total_logical_size = 0,
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
        .duration_ms = 0,
        .largest_items = .empty,
        .categories = .empty,
    };
}

pub fn observeDiagnostic(summary: *report.ScanSummary, diagnostic: report.Diagnostic) void {
    if (diagnostic.severity == .warning) summary.warning_count += 1;
    if (diagnostic.kind == .inaccessible) summary.inaccessible_count += 1;
    if (diagnostic.kind == .skipped) summary.skipped_count += 1;
}

pub fn observeNode(
    allocator: std.mem.Allocator,
    summary: *report.ScanSummary,
    node: *const report.Node,
    is_root: bool,
) !void {
    if (node.item_type == .file) {
        summary.file_count += 1;
        summary.total_logical_size += node.logical_size;
    }
    if (node.item_type == .directory) summary.folder_count += 1;
    if (node.allocated_size) |size| {
        summary.total_allocated_size = (summary.total_allocated_size orelse 0) + size;
    }

    try observeClassifiedItem(allocator, summary, node, is_root);
}

pub fn observeSummarizedDirectory(
    allocator: std.mem.Allocator,
    summary: *report.ScanSummary,
    node: *const report.Node,
    is_root: bool,
    descendant_file_count: u64,
    descendant_directory_count: u64,
) !void {
    summary.file_count += descendant_file_count;
    summary.folder_count += 1 + descendant_directory_count;
    summary.total_logical_size += node.logical_size;

    try observeClassifiedItem(allocator, summary, node, is_root);
}

pub fn buildSummary(
    allocator: std.mem.Allocator,
    root: *const report.Node,
    diagnostics: []const report.Diagnostic,
    duration_ms: u64,
) !report.ScanSummary {
    var summary = initSummary();
    errdefer report.freeSummary(allocator, &summary);
    summary.duration_ms = duration_ms;

    for (diagnostics) |diagnostic| {
        observeDiagnostic(&summary, diagnostic);
    }

    try collectSummary(allocator, &summary, root, true);
    return summary;
}

pub fn boundNodeChildren(allocator: std.mem.Allocator, node: *report.Node, max_children: usize) void {
    for (node.children.items) |*child| {
        boundNodeChildren(allocator, child, max_children);
    }

    retainTopChildren(allocator, node, max_children);
}

pub fn retainTopChildren(allocator: std.mem.Allocator, node: *report.Node, max_children: usize) void {
    std.mem.sort(report.Node, node.children.items, {}, largerNode);
    if (node.children.items.len <= max_children) {
        node.omitted_child_count = 0;
        return;
    }

    const retained_len = max_children;
    for (node.children.items[retained_len..]) |*child| {
        report.freeNode(allocator, child);
    }
    node.children.shrinkRetainingCapacity(retained_len);
    node.omitted_child_count = node.child_count - retained_len;
}

fn observeClassifiedItem(
    allocator: std.mem.Allocator,
    summary: *report.ScanSummary,
    node: *const report.Node,
    is_root: bool,
) !void {
    if (!is_root) {
        try appendLargestItem(allocator, summary, node);
    }

    if (node.classification) |node_classification| {
        if (scan_policy.isProtected(node.classification)) summary.protected_count += 1;
        const reclaimable_size = if (scan_policy.risk(node.classification) == .low) node.logical_size else 0;
        summary.likely_reclaimable_size += reclaimable_size;
        try addCategorySize(
            allocator,
            &summary.categories,
            node_classification.category,
            node.logical_size,
            reclaimable_size,
        );
    }
}

fn collectSummary(
    allocator: std.mem.Allocator,
    summary: *report.ScanSummary,
    node: *const report.Node,
    is_root: bool,
) !void {
    try observeNode(allocator, summary, node, is_root);

    for (node.children.items) |*child| {
        try collectSummary(allocator, summary, child, false);
    }
}

fn appendLargestItem(
    allocator: std.mem.Allocator,
    summary: *report.ScanSummary,
    node: *const report.Node,
) !void {
    const path_copy = try allocator.dupe(u8, node.path);
    errdefer allocator.free(path_copy);
    const name_copy = try allocator.dupe(u8, node.name);
    errdefer allocator.free(name_copy);

    try summary.largest_items.append(allocator, .{
        .path = path_copy,
        .name = name_copy,
        .item_type = node.item_type,
        .logical_size = node.logical_size,
        .classification = node.classification,
    });

    std.mem.sort(report.SummaryItem, summary.largest_items.items, {}, largerSummaryItem);
    if (summary.largest_items.items.len > 10) {
        freeSummaryItem(allocator, &summary.largest_items.items[10]);
        summary.largest_items.shrinkRetainingCapacity(10);
    }
}

fn freeSummaryItem(allocator: std.mem.Allocator, item: *report.SummaryItem) void {
    allocator.free(item.path);
    allocator.free(item.name);
}

fn addCategorySize(
    allocator: std.mem.Allocator,
    categories: *std.ArrayListUnmanaged(report.CategorySummary),
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

fn largerNode(_: void, left: report.Node, right: report.Node) bool {
    if (left.logical_size == right.logical_size) {
        return std.mem.lessThan(u8, left.name, right.name);
    }
    return left.logical_size > right.logical_size;
}

fn largerSummaryItem(_: void, left: report.SummaryItem, right: report.SummaryItem) bool {
    if (left.logical_size == right.logical_size) {
        return std.mem.lessThan(u8, left.name, right.name);
    }
    return left.logical_size > right.logical_size;
}

test "aggregates node totals and category summaries" {
    const allocator = std.testing.allocator;
    var summary = initSummary();
    defer report.freeSummary(allocator, &summary);

    const node = report.Node{
        .path = "/tmp/app/node_modules",
        .name = "node_modules",
        .item_type = .directory,
        .logical_size = 42,
        .allocated_size = null,
        .child_count = 0,
        .omitted_child_count = 0,
        .status = .complete,
        .classification = scan_policy.classify("/tmp/app/node_modules", "node_modules"),
        .children = .empty,
    };

    try observeSummarizedDirectory(allocator, &summary, &node, false, 3, 1);

    try std.testing.expectEqual(@as(u64, 42), summary.total_logical_size);
    try std.testing.expectEqual(@as(u64, 3), summary.file_count);
    try std.testing.expectEqual(@as(u64, 2), summary.folder_count);
    try std.testing.expectEqual(@as(usize, 1), summary.largest_items.items.len);
    try std.testing.expectEqual(@as(usize, 1), summary.categories.items.len);
    try std.testing.expectEqualStrings("Developer artifacts", summary.categories.items[0].category);
    try std.testing.expectEqual(@as(u64, 42), summary.categories.items[0].logical_size);
}
