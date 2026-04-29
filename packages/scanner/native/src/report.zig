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

pub const ScanReport = struct {
    root: Node,
    diagnostics: std.ArrayListUnmanaged(Diagnostic),
};

pub fn freeReport(allocator: std.mem.Allocator, scan_report: *ScanReport) void {
    freeNode(allocator, &scan_report.root);
    for (scan_report.diagnostics.items) |diagnostic| {
        allocator.free(diagnostic.path);
        allocator.free(diagnostic.message);
    }
    scan_report.diagnostics.deinit(allocator);
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
    try writer.writeAll(",\"diagnostics\":[");
    for (scan_report.diagnostics.items, 0..) |diagnostic, index| {
        if (index > 0) try writer.writeByte(',');
        try writeDiagnostic(writer, diagnostic);
    }
    try writer.writeAll("]}\n");
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
