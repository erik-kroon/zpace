const std = @import("std");

const aggregate_cache = @import("aggregate_cache.zig");
const events = @import("events.zig");
const classification = @import("classification.zig");
const report_builder = @import("report_builder.zig");
const report_json = @import("report_json.zig");
const scan_policy = @import("scan_policy.zig");
const scanner = @import("scanner.zig");

test {
    _ = aggregate_cache;
    _ = classification;
    _ = report_builder;
    _ = report_json;
    _ = scan_policy;
}

test "scanner defaults start with no events and empty progress" {
    const options = scanner.ScanOptions{ .emit_events = false };
    const progress = events.ScanProgress{};

    try std.testing.expect(!options.emit_events);
    try std.testing.expectEqual(@as(usize, 64), options.max_children_per_directory);
    try std.testing.expectEqual(@as(usize, 4), options.max_aggregate_workers);
    try std.testing.expectEqual(@as(usize, 0), options.exclude_paths.len);
    try std.testing.expect(!options.deep_scan_generated);
    try std.testing.expectEqual(@as(u64, 0), progress.paths_scanned);
    try std.testing.expectEqual(@as(?[]const u8, null), progress.current_path);
}
