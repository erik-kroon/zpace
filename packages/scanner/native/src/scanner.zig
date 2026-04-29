const std = @import("std");

const aggregate_cache_module = @import("aggregate_cache.zig");
const events = @import("events.zig");
const report = @import("report.zig");
const report_builder = @import("report_builder.zig");
const scan_policy = @import("scan_policy.zig");

pub const ScanOptions = struct {
    emit_events: bool,
    max_children_per_directory: usize = 64,
    max_aggregate_workers: usize = 4,
    exclude_paths: []const []const u8 = &.{},
    aggregate_cache_path: ?[]const u8 = null,
    deep_scan_generated: bool = false,
};

const progress_event_interval = 2048;
const child_retention_slack_multiplier = 2;

const DirectoryAggregate = aggregate_cache_module.DirectoryAggregate;
const AggregateCache = aggregate_cache_module.MemoryCache;
const PersistentAggregateCache = aggregate_cache_module.PersistentCache;

const AggregateTask = struct {
    path: []const u8,
};

const AggregateWorkerResult = struct {
    aggregate: DirectoryAggregate = .{},
    diagnostics: std.ArrayListUnmanaged(report.Diagnostic) = .empty,
    failed: ?anyerror = null,
};

const AggregateWorkQueue = struct {
    tasks: []const AggregateTask,
    next_index: usize = 0,
    mutex: std.atomic.Mutex = .unlocked,

    fn next(self: *AggregateWorkQueue) ?usize {
        while (!self.mutex.tryLock()) {
            std.atomic.spinLoopHint();
        }
        defer self.mutex.unlock();

        if (self.next_index >= self.tasks.len) return null;
        const index = self.next_index;
        self.next_index += 1;
        return index;
    }
};

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
    var summary = report_builder.initSummary();
    errdefer report.freeSummary(allocator, &summary);
    var aggregate_cache: AggregateCache = .empty;
    defer aggregate_cache_module.freeMemory(allocator, &aggregate_cache);
    var persistent_cache: PersistentAggregateCache = .empty;
    defer aggregate_cache_module.freePersistent(allocator, &persistent_cache);
    if (options.aggregate_cache_path) |cache_path| {
        aggregate_cache_module.load(allocator, io, cache_path, &persistent_cache) catch {};
    }

    var root = try scanNode(
        allocator,
        io,
        absolute_path,
        options,
        progress,
        event_writer,
        &diagnostics,
        &summary,
        &aggregate_cache,
        &persistent_cache,
        true,
        null,
    );
    errdefer report.freeNode(allocator, &root);

    const elapsed_ns = std.Io.Clock.awake.now(io).nanoseconds - started_at;
    const duration_ms = @as(u64, @intCast(@max(elapsed_ns, 0))) / std.time.ns_per_ms;
    summary.duration_ms = duration_ms;
    for (diagnostics.items) |diagnostic| {
        report_builder.observeDiagnostic(&summary, diagnostic);
    }
    if (options.aggregate_cache_path) |cache_path| {
        aggregate_cache_module.save(allocator, io, cache_path, &persistent_cache) catch {};
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
    summary: *report.ScanSummary,
    aggregate_cache: *AggregateCache,
    persistent_cache: *PersistentAggregateCache,
    is_root: bool,
    known_kind: ?std.Io.File.Kind,
) !report.Node {
    const cwd = std.Io.Dir.cwd();
    const initial_kind = known_kind orelse .unknown;
    const needs_stat = known_kind == null or initial_kind == .file or initial_kind == .unknown;
    const stat: ?std.Io.File.Stat = if (needs_stat) try cwd.statFile(io, absolute_path, .{}) else null;
    const file_kind = if (stat) |value| value.kind else initial_kind;
    const item_type = itemTypeFromKind(file_kind);
    const name = std.fs.path.basename(absolute_path);

    progress.paths_scanned += 1;
    if (item_type == .directory) {
        progress.directories_scanned += 1;
        progress.current_path = absolute_path;
    }
    if (item_type == .file) {
        progress.files_scanned += 1;
        progress.logical_size_scanned += stat.?.size;
    }
    if (options.emit_events and shouldEmitProgressEvent(progress.*)) {
        try events.writeProgressEvent(event_writer, "progress", progress.*);
    }

    var node = report.Node{
        .path = try allocator.dupe(u8, absolute_path),
        .name = try allocator.dupe(u8, name),
        .item_type = item_type,
        .logical_size = if (item_type == .file) stat.?.size else 0,
        .allocated_size = allocatedSize(stat, item_type),
        .child_count = 0,
        .omitted_child_count = 0,
        .status = .complete,
        .classification = scan_policy.classify(absolute_path, name),
        .children = .empty,
    };

    if (item_type != .directory) {
        try report_builder.observeNode(allocator, summary, &node, is_root);
        return node;
    }

    if (scan_policy.shouldSummarizeGeneratedDirectory(absolute_path, name, is_root)) {
        const aggregate = summarizeDirectory(
            allocator,
            io,
            absolute_path,
            options,
            progress,
            event_writer,
            diagnostics,
            aggregate_cache,
            persistent_cache,
        ) catch |err| {
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
            try report_builder.observeSummarizedDirectory(allocator, summary, &node, is_root, 0, 0);
            return node;
        };

        node.logical_size = aggregate.logical_size;
        node.child_count = aggregate.child_count;
        node.omitted_child_count = aggregate.child_count;
        node.status = aggregate.status;
        try report_builder.observeSummarizedDirectory(
            allocator,
            summary,
            &node,
            is_root,
            aggregate.file_count,
            aggregate.directory_count,
        );
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
        try report_builder.observeNode(allocator, summary, &node, is_root);
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

        if (isExcludedPath(child_path, options.exclude_paths)) {
            node.status = .partial;
            try appendDiagnostic(
                allocator,
                diagnostics,
                child_path,
                .skipped,
                .warning,
                "Skipped by scan exclude rule",
                "Remove this path from scan excludes to include it.",
            );
            continue;
        }

        const child = scanNode(
            allocator,
            io,
            child_path,
            options,
            progress,
            event_writer,
            diagnostics,
            summary,
            aggregate_cache,
            persistent_cache,
            false,
            entry.kind,
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
        if (node.children.items.len > options.max_children_per_directory * child_retention_slack_multiplier) {
            report_builder.retainTopChildren(allocator, &node, options.max_children_per_directory);
        }
    }

    report_builder.retainTopChildren(allocator, &node, options.max_children_per_directory);
    try report_builder.observeNode(allocator, summary, &node, is_root);
    return node;
}

fn shouldEmitProgressEvent(progress: events.ScanProgress) bool {
    return progress.paths_scanned == 1 or progress.paths_scanned % progress_event_interval == 0;
}

fn summarizeDirectory(
    allocator: std.mem.Allocator,
    io: std.Io,
    absolute_path: []const u8,
    options: ScanOptions,
    progress: *events.ScanProgress,
    event_writer: anytype,
    diagnostics: *std.ArrayListUnmanaged(report.Diagnostic),
    aggregate_cache: *AggregateCache,
    persistent_cache: *PersistentAggregateCache,
) anyerror!DirectoryAggregate {
    const cache_key = try scan_policy.createReusableAggregateKey(allocator, absolute_path);
    defer if (cache_key) |key| allocator.free(key);
    const directory_stat = if (cache_key != null) try std.Io.Dir.cwd().statFile(io, absolute_path, .{}) else null;
    if (cache_key) |key| {
        if (aggregate_cache_module.getMemory(aggregate_cache, key)) |cached| {
            progress.paths_scanned += cached.file_count + cached.directory_count;
            progress.files_scanned += cached.file_count;
            progress.directories_scanned += cached.directory_count;
            progress.logical_size_scanned += cached.logical_size;
            if (options.emit_events and shouldEmitProgressEvent(progress.*)) {
                try events.writeProgressEvent(event_writer, "progress", progress.*);
            }
            return cached;
        }
        if (directory_stat) |stat| {
            if (aggregate_cache_module.getPersistent(persistent_cache, key, stat)) |cached| {
                progress.paths_scanned += cached.file_count + cached.directory_count;
                progress.files_scanned += cached.file_count;
                progress.directories_scanned += cached.directory_count;
                progress.logical_size_scanned += cached.logical_size;
                if (options.emit_events and shouldEmitProgressEvent(progress.*)) {
                    try events.writeProgressEvent(event_writer, "progress", progress.*);
                }
                try aggregate_cache_module.putMemoryComplete(allocator, aggregate_cache, key, cached);
                return cached;
            }
        }
    }

    if (!options.deep_scan_generated) {
        const approximate_stat = directory_stat orelse try std.Io.Dir.cwd().statFile(io, absolute_path, .{});
        const aggregate = DirectoryAggregate{
            .logical_size = approximate_stat.size,
            .file_count = 0,
            .directory_count = 0,
            .child_count = 0,
            .status = .complete,
        };
        progress.logical_size_scanned += aggregate.logical_size;
        if (options.emit_events and shouldEmitProgressEvent(progress.*)) {
            try events.writeProgressEvent(event_writer, "progress", progress.*);
        }
        return aggregate;
    }

    const aggregate = if (options.max_aggregate_workers > 1)
        try summarizeDirectoryParallel(
            allocator,
            io,
            absolute_path,
            options,
            progress,
            event_writer,
            diagnostics,
            aggregate_cache,
            cache_key,
        )
    else
        try summarizeDirectorySequential(
            allocator,
            io,
            absolute_path,
            options,
            progress,
            event_writer,
            diagnostics,
            aggregate_cache,
            cache_key,
            persistent_cache,
        );

    if (cache_key) |key| {
        if (directory_stat) |stat| {
            if (aggregate.status == .complete) {
                try aggregate_cache_module.putPersistentComplete(allocator, persistent_cache, key, stat, aggregate);
            }
        }
    }
    return aggregate;
}

fn summarizeDirectorySequential(
    allocator: std.mem.Allocator,
    io: std.Io,
    absolute_path: []const u8,
    options: ScanOptions,
    progress: *events.ScanProgress,
    event_writer: anytype,
    diagnostics: *std.ArrayListUnmanaged(report.Diagnostic),
    aggregate_cache: *AggregateCache,
    cache_key: ?[]const u8,
    persistent_cache: *PersistentAggregateCache,
) anyerror!DirectoryAggregate {
    var aggregate = DirectoryAggregate{};
    var dir = try std.Io.Dir.openDirAbsolute(io, absolute_path, .{ .iterate = true });
    defer dir.close(io);

    var iterator = dir.iterate();
    while (true) {
        const maybe_entry = iterator.next(io) catch |err| {
            aggregate.status = .partial;
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

        aggregate.child_count += 1;
        if (isExcludedPath(child_path, options.exclude_paths)) {
            aggregate.status = .partial;
            try appendDiagnostic(
                allocator,
                diagnostics,
                child_path,
                .skipped,
                .warning,
                "Skipped by scan exclude rule",
                "Remove this path from scan excludes to include it.",
            );
            continue;
        }

        const initial_kind = entry.kind;
        const needs_stat = initial_kind == .file or initial_kind == .unknown;
        const stat: ?std.Io.File.Stat = if (needs_stat) std.Io.Dir.cwd().statFile(io, child_path, .{}) catch |err| {
            aggregate.status = .partial;
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
        } else null;
        const file_kind = if (stat) |value| value.kind else initial_kind;
        const item_type = itemTypeFromKind(file_kind);

        progress.paths_scanned += 1;
        if (item_type == .directory) {
            progress.directories_scanned += 1;
            aggregate.directory_count += 1;
        }
        if (item_type == .file) {
            const size = stat.?.size;
            progress.files_scanned += 1;
            progress.logical_size_scanned += size;
            aggregate.file_count += 1;
            aggregate.logical_size += size;
        }
        if (options.emit_events and shouldEmitProgressEvent(progress.*)) {
            try events.writeProgressEvent(event_writer, "progress", progress.*);
        }

        if (item_type == .directory) {
            const child_aggregate = summarizeDirectory(
                allocator,
                io,
                child_path,
                options,
                progress,
                event_writer,
                diagnostics,
                aggregate_cache,
                persistent_cache,
            ) catch |err| {
                aggregate.status = .partial;
                try appendDiagnostic(
                    allocator,
                    diagnostics,
                    child_path,
                    .inaccessible,
                    .warning,
                    diagnosticMessage(err),
                    diagnosticGuidance(err),
                );
                continue;
            };
            aggregate.logical_size += child_aggregate.logical_size;
            aggregate.file_count += child_aggregate.file_count;
            aggregate.directory_count += child_aggregate.directory_count;
            if (child_aggregate.status != .complete) aggregate.status = .partial;
        }
    }

    if (cache_key) |key| {
        if (aggregate.status == .complete) {
            try aggregate_cache_module.putMemoryComplete(allocator, aggregate_cache, key, aggregate);
        }
    }

    return aggregate;
}

fn summarizeDirectoryParallel(
    allocator: std.mem.Allocator,
    io: std.Io,
    absolute_path: []const u8,
    options: ScanOptions,
    progress: *events.ScanProgress,
    event_writer: anytype,
    diagnostics: *std.ArrayListUnmanaged(report.Diagnostic),
    aggregate_cache: *AggregateCache,
    cache_key: ?[]const u8,
) anyerror!DirectoryAggregate {
    var aggregate = DirectoryAggregate{};
    var directory_tasks: std.ArrayListUnmanaged(AggregateTask) = .empty;
    defer {
        for (directory_tasks.items) |task| allocator.free(task.path);
        directory_tasks.deinit(allocator);
    }

    var dir = try std.Io.Dir.openDirAbsolute(io, absolute_path, .{ .iterate = true });
    defer dir.close(io);

    var iterator = dir.iterate();
    while (true) {
        const maybe_entry = iterator.next(io) catch |err| {
            aggregate.status = .partial;
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
        errdefer allocator.free(child_path);

        aggregate.child_count += 1;
        if (isExcludedPath(child_path, options.exclude_paths)) {
            aggregate.status = .partial;
            try appendDiagnostic(
                allocator,
                diagnostics,
                child_path,
                .skipped,
                .warning,
                "Skipped by scan exclude rule",
                "Remove this path from scan excludes to include it.",
            );
            allocator.free(child_path);
            continue;
        }

        const initial_kind = entry.kind;
        const needs_stat = initial_kind == .file or initial_kind == .unknown;
        const stat: ?std.Io.File.Stat = if (needs_stat) std.Io.Dir.cwd().statFile(io, child_path, .{}) catch |err| {
            aggregate.status = .partial;
            try appendDiagnostic(
                allocator,
                diagnostics,
                child_path,
                .skipped,
                .warning,
                diagnosticMessage(err),
                diagnosticGuidance(err),
            );
            allocator.free(child_path);
            continue;
        } else null;
        const file_kind = if (stat) |value| value.kind else initial_kind;
        const item_type = itemTypeFromKind(file_kind);

        progress.paths_scanned += 1;
        if (item_type == .directory) {
            progress.directories_scanned += 1;
            aggregate.directory_count += 1;
            try directory_tasks.append(allocator, .{ .path = child_path });
        } else {
            allocator.free(child_path);
        }
        if (item_type == .file) {
            const size = stat.?.size;
            progress.files_scanned += 1;
            progress.logical_size_scanned += size;
            aggregate.file_count += 1;
            aggregate.logical_size += size;
        }
        if (options.emit_events and shouldEmitProgressEvent(progress.*)) {
            try events.writeProgressEvent(event_writer, "progress", progress.*);
        }
    }

    if (directory_tasks.items.len == 0) {
        try aggregate_cache_module.putMemoryComplete(allocator, aggregate_cache, cache_key, aggregate);
        return aggregate;
    }

    const results = try allocator.alloc(AggregateWorkerResult, directory_tasks.items.len);
    defer allocator.free(results);
    for (results) |*result| result.* = .{};

    var queue = AggregateWorkQueue{ .tasks = directory_tasks.items };
    const worker_count = @min(options.max_aggregate_workers, directory_tasks.items.len);
    const threads = try allocator.alloc(std.Thread, worker_count);
    defer allocator.free(threads);

    for (threads, 0..) |*thread, index| {
        thread.* = try std.Thread.spawn(.{}, aggregateWorkerMain, .{
            &queue,
            directory_tasks.items,
            results,
            io,
            options,
            index,
        });
    }
    for (threads) |thread| thread.join();

    for (results, 0..) |*result, index| {
        defer freeDiagnostics(std.heap.smp_allocator, &result.diagnostics);
        const task_path = directory_tasks.items[index].path;
        if (result.failed) |err| {
            aggregate.status = .partial;
            try appendDiagnostic(
                allocator,
                diagnostics,
                task_path,
                .inaccessible,
                .warning,
                diagnosticMessage(err),
                diagnosticGuidance(err),
            );
            continue;
        }

        aggregate.logical_size += result.aggregate.logical_size;
        aggregate.file_count += result.aggregate.file_count;
        aggregate.directory_count += result.aggregate.directory_count;
        if (result.aggregate.status != .complete) aggregate.status = .partial;
        progress.paths_scanned += result.aggregate.file_count + result.aggregate.directory_count;
        progress.files_scanned += result.aggregate.file_count;
        progress.directories_scanned += result.aggregate.directory_count;
        progress.logical_size_scanned += result.aggregate.logical_size;
        for (result.diagnostics.items) |diagnostic| {
            try appendDiagnostic(
                allocator,
                diagnostics,
                diagnostic.path,
                diagnostic.kind,
                diagnostic.severity,
                diagnostic.message,
                diagnostic.guidance,
            );
        }
        if (options.emit_events and shouldEmitProgressEvent(progress.*)) {
            try events.writeProgressEvent(event_writer, "progress", progress.*);
        }
    }

    try aggregate_cache_module.putMemoryComplete(allocator, aggregate_cache, cache_key, aggregate);
    return aggregate;
}

fn aggregateWorkerMain(
    queue: *AggregateWorkQueue,
    tasks: []const AggregateTask,
    results: []AggregateWorkerResult,
    io: std.Io,
    options: ScanOptions,
    worker_index: usize,
) void {
    _ = worker_index;
    while (queue.next()) |task_index| {
        var local_cache: AggregateCache = .empty;
        defer aggregate_cache_module.freeMemory(std.heap.smp_allocator, &local_cache);
        var progress = events.ScanProgress{};
        results[task_index].aggregate = summarizeDirectoryQuiet(
            std.heap.smp_allocator,
            io,
            tasks[task_index].path,
            options,
            &progress,
            &results[task_index].diagnostics,
            &local_cache,
        ) catch |err| {
            results[task_index].failed = err;
            continue;
        };
    }
}

fn summarizeDirectoryQuiet(
    allocator: std.mem.Allocator,
    io: std.Io,
    absolute_path: []const u8,
    options: ScanOptions,
    progress: *events.ScanProgress,
    diagnostics: *std.ArrayListUnmanaged(report.Diagnostic),
    aggregate_cache: *AggregateCache,
) anyerror!DirectoryAggregate {
    const cache_key = try scan_policy.createReusableAggregateKey(allocator, absolute_path);
    defer if (cache_key) |key| allocator.free(key);
    if (cache_key) |key| {
        if (aggregate_cache_module.getMemory(aggregate_cache, key)) |cached| {
            progress.paths_scanned += cached.file_count + cached.directory_count;
            progress.files_scanned += cached.file_count;
            progress.directories_scanned += cached.directory_count;
            progress.logical_size_scanned += cached.logical_size;
            return cached;
        }
    }

    var aggregate = DirectoryAggregate{};
    var dir = try std.Io.Dir.openDirAbsolute(io, absolute_path, .{ .iterate = true });
    defer dir.close(io);

    var iterator = dir.iterate();
    while (true) {
        const maybe_entry = iterator.next(io) catch |err| {
            aggregate.status = .partial;
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

        aggregate.child_count += 1;
        if (isExcludedPath(child_path, options.exclude_paths)) {
            aggregate.status = .partial;
            try appendDiagnostic(
                allocator,
                diagnostics,
                child_path,
                .skipped,
                .warning,
                "Skipped by scan exclude rule",
                "Remove this path from scan excludes to include it.",
            );
            continue;
        }

        const initial_kind = entry.kind;
        const needs_stat = initial_kind == .file or initial_kind == .unknown;
        const stat: ?std.Io.File.Stat = if (needs_stat) std.Io.Dir.cwd().statFile(io, child_path, .{}) catch |err| {
            aggregate.status = .partial;
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
        } else null;
        const file_kind = if (stat) |value| value.kind else initial_kind;
        const item_type = itemTypeFromKind(file_kind);

        progress.paths_scanned += 1;
        if (item_type == .directory) {
            progress.directories_scanned += 1;
            aggregate.directory_count += 1;
        }
        if (item_type == .file) {
            const size = stat.?.size;
            progress.files_scanned += 1;
            progress.logical_size_scanned += size;
            aggregate.file_count += 1;
            aggregate.logical_size += size;
        }

        if (item_type == .directory) {
            const child_aggregate = summarizeDirectoryQuiet(
                allocator,
                io,
                child_path,
                options,
                progress,
                diagnostics,
                aggregate_cache,
            ) catch |err| {
                aggregate.status = .partial;
                try appendDiagnostic(
                    allocator,
                    diagnostics,
                    child_path,
                    .inaccessible,
                    .warning,
                    diagnosticMessage(err),
                    diagnosticGuidance(err),
                );
                continue;
            };
            aggregate.logical_size += child_aggregate.logical_size;
            aggregate.file_count += child_aggregate.file_count;
            aggregate.directory_count += child_aggregate.directory_count;
            if (child_aggregate.status != .complete) aggregate.status = .partial;
        }
    }

    try aggregate_cache_module.putMemoryComplete(allocator, aggregate_cache, cache_key, aggregate);
    return aggregate;
}

fn isExcludedPath(path: []const u8, exclude_paths: []const []const u8) bool {
    for (exclude_paths) |exclude_path| {
        if (exclude_path.len == 0) continue;
        if (std.mem.eql(u8, path, exclude_path)) return true;
        if (std.mem.startsWith(u8, path, exclude_path) and path.len > exclude_path.len and path[exclude_path.len] == std.fs.path.sep) {
            return true;
        }
    }
    return false;
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

fn allocatedSize(stat: ?std.Io.File.Stat, item_type: report.ItemType) ?u64 {
    if (item_type == .directory) return null;
    if (stat) |value| return value.size;
    return null;
}
