const std = @import("std");

const classification = @import("classification.zig");

pub const Classification = classification.Classification;
pub const RiskLevel = classification.RiskLevel;

pub fn classify(path: []const u8, name: []const u8) ?Classification {
    return classification.classify(path, name);
}

pub fn risk(classification_value: ?Classification) ?RiskLevel {
    return if (classification_value) |value| value.risk else null;
}

pub fn isProtected(classification_value: ?Classification) bool {
    return if (classification_value) |value| value.is_protected else false;
}

pub fn shouldSummarizeGeneratedDirectory(path: []const u8, name: []const u8, is_root: bool) bool {
    if (is_root) return false;

    return isProjectDependencyDirectory(name) or
        equals(name, ".pnpm-store") or
        equals(name, ".npm") or
        equals(name, ".yarn") or
        equals(name, ".bun") or
        equals(name, ".venv") or
        equals(name, "venv") or
        contains(path, "/node_modules/") or
        contains(path, "/.bun/install/cache") or
        contains(path, "/.cargo/registry") or
        contains(path, "/.cargo/git") or
        contains(path, "/go/pkg/mod");
}

pub fn createReusableAggregateKey(allocator: std.mem.Allocator, path: []const u8) !?[]const u8 {
    const parent = std.fs.path.dirname(path) orelse return null;
    const parent_name = std.fs.path.basename(parent);
    const grandparent = std.fs.path.dirname(parent) orelse return null;
    const grandparent_name = std.fs.path.basename(grandparent);
    if (!equals(grandparent_name, "node_modules")) return null;

    if (equals(parent_name, ".bun")) return try prefixedKey(allocator, "bun:", std.fs.path.basename(path));
    if (equals(parent_name, ".pnpm")) return try prefixedKey(allocator, "pnpm:", std.fs.path.basename(path));
    return null;
}

fn isProjectDependencyDirectory(name: []const u8) bool {
    return equals(name, "node_modules") or equals(name, "bower_components");
}

fn prefixedKey(allocator: std.mem.Allocator, prefix: []const u8, value: []const u8) ![]const u8 {
    return try std.mem.concat(allocator, u8, &.{ prefix, value });
}

fn equals(left: []const u8, right: []const u8) bool {
    return std.mem.eql(u8, left, right);
}

fn contains(haystack: []const u8, needle: []const u8) bool {
    return std.mem.indexOf(u8, haystack, needle) != null;
}

test "delegates classification and exposes risk/protection decisions" {
    const protected_classification = classify("/System/Library/CoreServices", "CoreServices");
    try std.testing.expect(isProtected(protected_classification));
    try std.testing.expectEqual(RiskLevel.high, risk(protected_classification).?);

    const generated_classification = classify("/tmp/app/.next", ".next");
    try std.testing.expect(!isProtected(generated_classification));
    try std.testing.expectEqual(RiskLevel.low, risk(generated_classification).?);
}

test "answers generated directory summary eligibility" {
    try std.testing.expect(!shouldSummarizeGeneratedDirectory("/tmp/app/node_modules", "node_modules", true));
    try std.testing.expect(!shouldSummarizeGeneratedDirectory("/tmp/app/.venv", ".venv", true));
    try std.testing.expect(shouldSummarizeGeneratedDirectory("/tmp/app/node_modules", "node_modules", false));
    try std.testing.expect(shouldSummarizeGeneratedDirectory("/tmp/app/node_modules/react", "react", false));
    try std.testing.expect(shouldSummarizeGeneratedDirectory("/Users/me/.cargo/registry", "registry", false));
    try std.testing.expect(!shouldSummarizeGeneratedDirectory("/Users/me/Documents", "Documents", false));
}

test "creates reusable aggregate identities for nested package stores" {
    const allocator = std.testing.allocator;

    const pnpm_key = (try createReusableAggregateKey(allocator, "/tmp/app/node_modules/.pnpm/react@1.0.0")) orelse return error.ExpectedKey;
    defer allocator.free(pnpm_key);
    try std.testing.expectEqualStrings("pnpm:react@1.0.0", pnpm_key);

    const bun_key = (try createReusableAggregateKey(allocator, "/tmp/app/node_modules/.bun/react")) orelse return error.ExpectedKey;
    defer allocator.free(bun_key);
    try std.testing.expectEqualStrings("bun:react", bun_key);

    try std.testing.expectEqual(@as(?[]const u8, null), try createReusableAggregateKey(allocator, "/tmp/app/vendor/react"));
}
