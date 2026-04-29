const std = @import("std");

const events = @import("events.zig");
const classification = @import("classification.zig");
const report = @import("report.zig");

pub const ScanOptions = struct {
    emit_events: bool,
};

const progress_event_interval = 128;

pub fn scanPath(
    allocator: std.mem.Allocator,
    io: std.Io,
    absolute_path: []const u8,
    options: ScanOptions,
    progress: *events.ScanProgress,
    event_writer: anytype,
) !report.ScanReport {
    const started_at = std.Io.Clock.awake.now(io).nanoseconds;
    var diagnostics: std.ArrayListUnmanaged(report.Diagnostic) = .empty;
    errdefer freeDiagnostics(allocator, &diagnostics);

    var root = try scanNode(
        allocator,
        io,
        absolute_path,
        options,
        progress,
        event_writer,
        &diagnostics,
    );
    errdefer report.freeNode(allocator, &root);

    const elapsed_ns = std.Io.Clock.awake.now(io).nanoseconds - started_at;
    const duration_ms = @as(u64, @intCast(@max(elapsed_ns, 0))) / std.time.ns_per_ms;
    const summary = try report.buildSummary(allocator, &root, diagnostics.items, duration_ms);
    errdefer {
        summary.largest_items.deinit(allocator);
        summary.categories.deinit(allocator);
    }

    return .{ .root = root, .diagnostics = diagnostics, .summary = summary };
}

fn scanNode(
    allocator: std.mem.Allocator,
    io: std.Io,
    absolute_path: []const u8,
    options: ScanOptions,
    progress: *events.ScanProgress,
    event_writer: anytype,
    diagnostics: *std.ArrayListUnmanaged(report.Diagnostic),
) !report.Node {
    const cwd = std.Io.Dir.cwd();
    const stat = try cwd.statFile(io, absolute_path, .{});
    const item_type = itemTypeFromKind(stat.kind);
    const name = std.fs.path.basename(absolute_path);

    progress.paths_scanned += 1;
    progress.current_path = absolute_path;
    if (item_type == .directory) progress.directories_scanned += 1;
    if (item_type == .file) progress.files_scanned += 1;
    if (options.emit_events and shouldEmitProgressEvent(progress.*)) {
        try events.writeProgressEvent(event_writer, "progress", progress.*);
    }

    var node = report.Node{
        .path = try allocator.dupe(u8, absolute_path),
        .name = try allocator.dupe(u8, name),
        .item_type = item_type,
        .logical_size = if (item_type == .file) stat.size else 0,
        .allocated_size = allocatedSize(stat),
        .child_count = 0,
        .status = .complete,
        .classification = classification.classify(absolute_path, name),
        .children = .empty,
    };

    if (item_type != .directory) {
        return node;
    }

    var dir = std.Io.Dir.openDirAbsolute(io, absolute_path, .{ .iterate = true }) catch |err| {
        node.status = .failed;
        try appendDiagnostic(
            allocator,
            diagnostics,
            absolute_path,
            .inaccessible,
            .warning,
            diagnosticMessage(err),
            diagnosticGuidance(err),
        );
        return node;
    };
    defer dir.close(io);

    var iterator = dir.iterate();
    while (true) {
        const maybe_entry = iterator.next(io) catch |err| {
            node.status = .partial;
            try appendDiagnostic(
                allocator,
                diagnostics,
                absolute_path,
                .inaccessible,
                .warning,
                diagnosticMessage(err),
                diagnosticGuidance(err),
            );
            break;
        };
        const entry = maybe_entry orelse break;
        const child_path = try std.fs.path.join(allocator, &.{ absolute_path, entry.name });
        defer allocator.free(child_path);

        const child = scanNode(
            allocator,
            io,
            child_path,
            options,
            progress,
            event_writer,
            diagnostics,
        ) catch |err| {
            node.status = .partial;
            try appendDiagnostic(
                allocator,
                diagnostics,
                child_path,
                .skipped,
                .warning,
                diagnosticMessage(err),
                diagnosticGuidance(err),
            );
            continue;
        };

        node.logical_size += child.logical_size;
        node.child_count += 1;
        if (child.status != .complete) node.status = .partial;
        try node.children.append(allocator, child);
    }

    return node;
}

fn shouldEmitProgressEvent(progress: events.ScanProgress) bool {
    return progress.paths_scanned == 1 or progress.paths_scanned % progress_event_interval == 0;
}

fn appendDiagnostic(
    allocator: std.mem.Allocator,
    diagnostics: *std.ArrayListUnmanaged(report.Diagnostic),
    path: []const u8,
    kind: report.DiagnosticKind,
    severity: report.DiagnosticSeverity,
    message: []const u8,
    guidance: ?[]const u8,
) !void {
    const path_copy = try allocator.dupe(u8, path);
    errdefer allocator.free(path_copy);
    const message_copy = try allocator.dupe(u8, message);
    errdefer allocator.free(message_copy);
    const guidance_copy = if (guidance) |value| try allocator.dupe(u8, value) else null;
    errdefer if (guidance_copy) |value| allocator.free(value);

    try diagnostics.append(allocator, .{
        .path = path_copy,
        .kind = kind,
        .severity = severity,
        .message = message_copy,
        .guidance = guidance_copy,
    });
}

fn diagnosticMessage(err: anyerror) []const u8 {
    return switch (err) {
        error.AccessDenied => "Permission denied",
        else => @errorName(err),
    };
}

fn diagnosticGuidance(err: anyerror) ?[]const u8 {
    return switch (err) {
        error.AccessDenied => "Grant Full Disk Access to the app or terminal running zpace, then scan again.",
        else => null,
    };
}

fn freeDiagnostics(
    allocator: std.mem.Allocator,
    diagnostics: *std.ArrayListUnmanaged(report.Diagnostic),
) void {
    for (diagnostics.items) |diagnostic| {
        allocator.free(diagnostic.path);
        allocator.free(diagnostic.message);
        if (diagnostic.guidance) |guidance| allocator.free(guidance);
    }
    diagnostics.deinit(allocator);
}

fn itemTypeFromKind(kind: std.Io.File.Kind) report.ItemType {
    return switch (kind) {
        .file => .file,
        .directory => .directory,
        .sym_link => .symlink,
        else => .other,
    };
}

fn allocatedSize(stat: std.Io.File.Stat) ?u64 {
    if (stat.kind == .directory) return null;
    return stat.size;
}
