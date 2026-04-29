const std = @import("std");

const events = @import("events.zig");
const report = @import("report.zig");
const scanner = @import("scanner.zig");

pub fn main(init: std.process.Init) !void {
    const allocator = init.gpa;

    var args = try std.process.Args.Iterator.initAllocator(init.minimal.args, allocator);
    defer args.deinit();
    _ = args.skip();

    var emit_events = false;
    var input_path: ?[]const u8 = null;
    while (args.next()) |arg| {
        if (std.mem.eql(u8, arg, "--events")) {
            emit_events = true;
        } else {
            input_path = arg;
        }
    }

    const requested_path = input_path orelse {
        std.debug.print("usage: zpace-scanner <path>\n", .{});
        std.process.exit(64);
    };
    const absolute_path = if (std.fs.path.isAbsolute(requested_path))
        try allocator.dupe(u8, requested_path)
    else blk: {
        const cwd_path = try std.process.currentPathAlloc(init.io, allocator);
        defer allocator.free(cwd_path);
        break :blk try std.fs.path.join(allocator, &.{ cwd_path, requested_path });
    };
    defer allocator.free(absolute_path);

    var stderr_buffer: [4096]u8 = undefined;
    var stderr_file_writer = std.Io.File.stderr().writerStreaming(init.io, &stderr_buffer);
    const stderr = &stderr_file_writer.interface;
    const options = scanner.ScanOptions{ .emit_events = emit_events };
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
    try report.writeReport(stdout, scan_report);
    try stdout.flush();
}
