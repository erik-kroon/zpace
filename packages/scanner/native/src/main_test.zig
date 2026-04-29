const std = @import("std");

const events = @import("events.zig");
const classification = @import("classification.zig");
const scanner = @import("scanner.zig");

test {
    _ = classification;
}

test "scanner defaults start with no events and empty progress" {
    const options = scanner.ScanOptions{ .emit_events = false };
    const progress = events.ScanProgress{};

    try std.testing.expect(!options.emit_events);
    try std.testing.expectEqual(@as(u64, 0), progress.paths_scanned);
    try std.testing.expectEqual(@as(?[]const u8, null), progress.current_path);
}
