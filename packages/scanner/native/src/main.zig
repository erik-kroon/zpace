const std = @import("std");

const events = @import("events.zig");
const report = @import("report.zig");
const report_json = @import("report_json.zig");
const scanner = @import("scanner.zig");

pub fn main(init: std.process.Init) !void {
    const allocator = init.gpa;

    var args = try std.process.Args.Iterator.initAllocator(init.minimal.args, allocator);
    defer args.deinit();
    _ = args.skip();

    var emit_events = false;
    var deep_scan_generated = false;
    var input_path: ?[]const u8 = null;
    var exclude_args: std.ArrayListUnmanaged([]const u8) = .empty;
    defer exclude_args.deinit(allocator);
    while (args.next()) |arg| {
        if (std.mem.eql(u8, arg, "--events")) {
            emit_events = true;
        } else if (std.mem.eql(u8, arg, "--deep-scan")) {
            deep_scan_generated = true;
        } else if (std.mem.eql(u8, arg, "--exclude")) {
            const exclude_path = args.next() orelse {
                std.debug.print("usage: zpace-scanner [--events] [--deep-scan] [--exclude <path>] <path>\n", .{});
                std.process.exit(64);
            };
            try exclude_args.append(allocator, exclude_path);
        } else {
            input_path = arg;
        }
    }

    const requested_path = input_path orelse {
        std.debug.print("usage: zpace-scanner [--events] [--deep-scan] [--exclude <path>] <path>\n", .{});
        std.process.exit(64);
    };
    const absolute_path = try absolutePath(allocator, init.io, requested_path);
    defer allocator.free(absolute_path);

    var exclude_paths: std.ArrayListUnmanaged([]const u8) = .empty;
    defer {
        for (exclude_paths.items) |exclude_path| allocator.free(exclude_path);
        exclude_paths.deinit(allocator);
    }
    for (exclude_args.items) |exclude_arg| {
        try exclude_paths.append(allocator, try absolutePath(allocator, init.io, exclude_arg));
    }
    const aggregate_cache_path = try defaultAggregateCachePath(allocator, init.io, init.environ_map);
    defer if (aggregate_cache_path) |path| allocator.free(path);

    var stderr_buffer: [4096]u8 = undefined;
    var stderr_file_writer = std.Io.File.stderr().writerStreaming(init.io, &stderr_buffer);
    const stderr = &stderr_file_writer.interface;
    const options = scanner.ScanOptions{
        .emit_events = emit_events,
        .exclude_paths = exclude_paths.items,
        .aggregate_cache_path = aggregate_cache_path,
        .deep_scan_generated = deep_scan_generated,
    };
    var progress = events.ScanProgress{};
    if (options.emit_events) {
        try events.writeStartedEvent(stderr, absolute_path);
        try stderr.flush();
    }

    var scan_report = try scanner.scanPath(allocator, init.io, absolute_path, options, &progress, stderr);
    defer report.freeReport(allocator, &scan_report);
    if (options.emit_events) {
        progress.current_path = null;
        try events.writeProgressEvent(stderr, "completed", progress);
        try stderr.flush();
    }

    var stdout_buffer: [4096]u8 = undefined;
    var stdout_file_writer = std.Io.File.stdout().writerStreaming(init.io, &stdout_buffer);
    const stdout = &stdout_file_writer.interface;
    try report_json.writeReport(stdout, scan_report);
    try stdout.flush();
}

fn absolutePath(allocator: std.mem.Allocator, io: std.Io, path: []const u8) ![]const u8 {
    if (std.fs.path.isAbsolute(path)) return try allocator.dupe(u8, path);

    const cwd_path = try std.process.currentPathAlloc(io, allocator);
    defer allocator.free(cwd_path);
    return try std.fs.path.join(allocator, &.{ cwd_path, path });
}

fn defaultAggregateCachePath(
    allocator: std.mem.Allocator,
    io: std.Io,
    environ_map: *std.process.Environ.Map,
) !?[]const u8 {
    if (environ_map.get("XDG_CACHE_HOME")) |cache_home| {
        const cache_dir = try std.fs.path.join(allocator, &.{ cache_home, "zpace" });
        defer allocator.free(cache_dir);
        std.Io.Dir.cwd().createDirPath(io, cache_dir) catch {};
        return try std.fs.path.join(allocator, &.{ cache_dir, "scanner-aggregates.tsv" });
    }

    if (environ_map.get("HOME")) |home| {
        const library_cache_dir = try std.fs.path.join(allocator, &.{ home, "Library", "Caches", "zpace" });
        defer allocator.free(library_cache_dir);
        std.Io.Dir.cwd().createDirPath(io, library_cache_dir) catch {};
        return try std.fs.path.join(allocator, &.{ library_cache_dir, "scanner-aggregates.tsv" });
    }

    return null;
}
