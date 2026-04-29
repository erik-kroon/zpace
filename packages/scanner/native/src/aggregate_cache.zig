const std = @import("std");

const report = @import("report.zig");
const scan_policy = @import("scan_policy.zig");

pub const DirectoryAggregate = struct {
    logical_size: u64 = 0,
    file_count: u64 = 0,
    directory_count: u64 = 0,
    child_count: u64 = 0,
    status: report.ScanStatus = .complete,
};

pub const MemoryCache = std.StringHashMapUnmanaged(DirectoryAggregate);

const PersistentAggregate = struct {
    inode: u64,
    mtime: i96,
    size: u64,
    aggregate: DirectoryAggregate,
};

pub const PersistentCache = std.StringHashMapUnmanaged(PersistentAggregate);

pub fn reusableKey(allocator: std.mem.Allocator, path: []const u8) !?[]const u8 {
    return try scan_policy.createReusableAggregateKey(allocator, path);
}

pub fn getMemory(
    cache: *MemoryCache,
    key: []const u8,
) ?DirectoryAggregate {
    return cache.get(key);
}

pub fn putMemoryComplete(
    allocator: std.mem.Allocator,
    cache: *MemoryCache,
    cache_key: ?[]const u8,
    aggregate: DirectoryAggregate,
) !void {
    if (cache_key) |key| {
        if (aggregate.status == .complete) {
            try cache.put(allocator, try allocator.dupe(u8, key), aggregate);
        }
    }
}

pub fn getPersistent(
    persistent_cache: *PersistentCache,
    key: []const u8,
    stat: std.Io.File.Stat,
) ?DirectoryAggregate {
    const cached = persistent_cache.get(key) orelse return null;
    if (cached.inode != stat.inode) return null;
    if (cached.mtime != stat.mtime.nanoseconds) return null;
    if (cached.size != stat.size) return null;
    return cached.aggregate;
}

pub fn putPersistentComplete(
    allocator: std.mem.Allocator,
    persistent_cache: *PersistentCache,
    key: []const u8,
    stat: std.Io.File.Stat,
    aggregate: DirectoryAggregate,
) !void {
    if (aggregate.status != .complete) return;

    const entry = try persistent_cache.getOrPut(allocator, key);
    if (!entry.found_existing) {
        entry.key_ptr.* = try allocator.dupe(u8, key);
    }
    entry.value_ptr.* = .{
        .inode = stat.inode,
        .mtime = stat.mtime.nanoseconds,
        .size = stat.size,
        .aggregate = aggregate,
    };
}

pub fn load(
    allocator: std.mem.Allocator,
    io: std.Io,
    path: []const u8,
    persistent_cache: *PersistentCache,
) !void {
    const data = std.Io.Dir.cwd().readFileAlloc(io, path, allocator, .limited(16 * 1024 * 1024)) catch return;
    defer allocator.free(data);

    var lines = std.mem.splitScalar(u8, data, '\n');
    while (lines.next()) |line| {
        if (line.len == 0) continue;
        var fields = std.mem.splitScalar(u8, line, '\t');
        const key = fields.next() orelse continue;
        const inode_text = fields.next() orelse continue;
        const mtime_text = fields.next() orelse continue;
        const size_text = fields.next() orelse continue;
        const logical_size_text = fields.next() orelse continue;
        const file_count_text = fields.next() orelse continue;
        const directory_count_text = fields.next() orelse continue;
        const child_count_text = fields.next() orelse continue;

        const inode = std.fmt.parseInt(u64, inode_text, 10) catch continue;
        const mtime = std.fmt.parseInt(i96, mtime_text, 10) catch continue;
        const size = std.fmt.parseInt(u64, size_text, 10) catch continue;
        const logical_size = std.fmt.parseInt(u64, logical_size_text, 10) catch continue;
        const file_count = std.fmt.parseInt(u64, file_count_text, 10) catch continue;
        const directory_count = std.fmt.parseInt(u64, directory_count_text, 10) catch continue;
        const child_count = std.fmt.parseInt(u64, child_count_text, 10) catch continue;

        try persistent_cache.put(allocator, try allocator.dupe(u8, key), .{
            .inode = inode,
            .mtime = mtime,
            .size = size,
            .aggregate = .{
                .logical_size = logical_size,
                .file_count = file_count,
                .directory_count = directory_count,
                .child_count = child_count,
                .status = .complete,
            },
        });
    }
}

pub fn save(
    allocator: std.mem.Allocator,
    io: std.Io,
    path: []const u8,
    persistent_cache: *PersistentCache,
) !void {
    var data: std.ArrayListUnmanaged(u8) = .empty;
    defer data.deinit(allocator);

    var iterator = persistent_cache.iterator();
    while (iterator.next()) |entry| {
        const line = try std.fmt.allocPrint(
            allocator,
            "{s}\t{d}\t{d}\t{d}\t{d}\t{d}\t{d}\t{d}\n",
            .{
                entry.key_ptr.*,
                entry.value_ptr.inode,
                entry.value_ptr.mtime,
                entry.value_ptr.size,
                entry.value_ptr.aggregate.logical_size,
                entry.value_ptr.aggregate.file_count,
                entry.value_ptr.aggregate.directory_count,
                entry.value_ptr.aggregate.child_count,
            },
        );
        defer allocator.free(line);
        try data.appendSlice(allocator, line);
    }

    try std.Io.Dir.cwd().writeFile(io, .{ .sub_path = path, .data = data.items });
}

pub fn freeMemory(allocator: std.mem.Allocator, cache: *MemoryCache) void {
    var iterator = cache.iterator();
    while (iterator.next()) |entry| {
        allocator.free(entry.key_ptr.*);
    }
    cache.deinit(allocator);
}

pub fn freePersistent(allocator: std.mem.Allocator, persistent_cache: *PersistentCache) void {
    var iterator = persistent_cache.iterator();
    while (iterator.next()) |entry| {
        allocator.free(entry.key_ptr.*);
    }
    persistent_cache.deinit(allocator);
}


test "creates reusable aggregate identities for nested package stores" {
    const allocator = std.testing.allocator;

    const pnpm_key = (try reusableKey(allocator, "/tmp/app/node_modules/.pnpm/react@1.0.0")) orelse return error.ExpectedKey;
    defer allocator.free(pnpm_key);
    try std.testing.expectEqualStrings("pnpm:react@1.0.0", pnpm_key);

    const bun_key = (try reusableKey(allocator, "/tmp/app/node_modules/.bun/react")) orelse return error.ExpectedKey;
    defer allocator.free(bun_key);
    try std.testing.expectEqualStrings("bun:react", bun_key);

    try std.testing.expectEqual(@as(?[]const u8, null), try reusableKey(allocator, "/tmp/app/vendor/react"));
}
