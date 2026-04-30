const std = @import("std");

const report = @import("report.zig");
const scan_policy = @import("scan_policy.zig");

pub fn writeReport(writer: anytype, scan_report: report.ScanReport) !void {
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

fn writeSummary(writer: anytype, summary: report.ScanSummary) !void {
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

fn writeSummaryItem(writer: anytype, item: report.SummaryItem) !void {
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

fn writeCategorySummary(writer: anytype, category: report.CategorySummary) !void {
    try writer.writeAll("{\"category\":");
    try writeJsonString(writer, category.category);
    try writer.print(
        ",\"logicalSize\":{},\"itemCount\":{},\"likelyReclaimableSize\":{}",
        .{ category.logical_size, category.item_count, category.likely_reclaimable_size },
    );
    try writer.writeAll("}");
}

fn writeNode(writer: anytype, node: report.Node) !void {
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
    try writer.print(
        ",\"childCount\":{},\"omittedChildCount\":{},\"childrenTruncated\":{},\"status\":",
        .{ node.child_count, node.omitted_child_count, node.omitted_child_count > 0 },
    );
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

fn writeClassification(writer: anytype, node_classification: scan_policy.Classification) !void {
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

fn writeDiagnostic(writer: anytype, diagnostic: report.Diagnostic) !void {
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
    var index: usize = 0;
    while (index < value.len) {
        const char = value[index];
        switch (char) {
            '"' => {
                try writer.writeAll("\\\"");
                index += 1;
            },
            '\\' => {
                try writer.writeAll("\\\\");
                index += 1;
            },
            '\n' => {
                try writer.writeAll("\\n");
                index += 1;
            },
            '\r' => {
                try writer.writeAll("\\r");
                index += 1;
            },
            '\t' => {
                try writer.writeAll("\\t");
                index += 1;
            },
            else => {
                if (char < 0x20) {
                    try writer.print("\\u{x:0>4}", .{char});
                    index += 1;
                } else if (char < 0x80) {
                    try writer.writeByte(char);
                    index += 1;
                } else {
                    const sequence_len = std.unicode.utf8ByteSequenceLength(char) catch {
                        try writer.writeAll("\\uFFFD");
                        index += 1;
                        continue;
                    };
                    if (index + sequence_len > value.len) {
                        try writer.writeAll("\\uFFFD");
                        index += 1;
                        continue;
                    }
                    const sequence = value[index..][0..sequence_len];
                    _ = std.unicode.utf8Decode(sequence) catch {
                        try writer.writeAll("\\uFFFD");
                        index += 1;
                        continue;
                    };
                    try writer.writeAll(sequence);
                    index += sequence_len;
                }
            },
        }
    }
    try writer.writeByte('"');
}

fn statusName(status: report.ScanStatus) []const u8 {
    return switch (status) {
        .complete => "complete",
        .partial => "partial",
        .failed => "error",
    };
}

test "escapes JSON strings" {
    var stream = std.Io.Writer.Allocating.init(std.testing.allocator);
    defer stream.deinit();

    try writeJsonString(&stream.writer, "a\"b\\c\n");

    try std.testing.expectEqualStrings("\"a\\\"b\\\\c\\n\"", stream.written());
}

test "keeps valid utf-8 and replaces invalid filesystem bytes" {
    var stream = std.Io.Writer.Allocating.init(std.testing.allocator);
    defer stream.deinit();

    try writeJsonString(&stream.writer, "ok 😄 \xffbad");

    try std.testing.expectEqualStrings("\"ok 😄 \\uFFFDbad\"", stream.written());
}
