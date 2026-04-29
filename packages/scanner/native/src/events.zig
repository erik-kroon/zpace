const report_json = @import("report_json.zig");

pub const ScanProgress = struct {
    paths_scanned: u64 = 0,
    directories_scanned: u64 = 0,
    files_scanned: u64 = 0,
    logical_size_scanned: u64 = 0,
    current_path: ?[]const u8 = null,
};

pub fn writeStartedEvent(writer: anytype, path: []const u8) !void {
    try writer.writeAll("{\"type\":\"started\",\"path\":");
    try report_json.writeJsonString(writer, path);
    try writer.writeAll("}\n");
}

pub fn writeProgressEvent(writer: anytype, event_type: []const u8, progress: ScanProgress) !void {
    try writer.writeAll("{\"type\":");
    try report_json.writeJsonString(writer, event_type);
    try writer.writeAll(",\"progress\":{\"pathsScanned\":");
    try writer.print("{}", .{progress.paths_scanned});
    try writer.writeAll(",\"directoriesScanned\":");
    try writer.print("{}", .{progress.directories_scanned});
    try writer.writeAll(",\"filesScanned\":");
    try writer.print("{}", .{progress.files_scanned});
    try writer.writeAll(",\"logicalSizeScanned\":");
    try writer.print("{}", .{progress.logical_size_scanned});
    try writer.writeAll(",\"currentPath\":");
    if (progress.current_path) |current_path| {
        try report_json.writeJsonString(writer, current_path);
    } else {
        try writer.writeAll("null");
    }
    try writer.writeAll("}}\n");
}
