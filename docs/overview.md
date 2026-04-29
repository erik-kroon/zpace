# Overview

zpace is a macOS disk space visualizer and cleaner for anyone who wants to understand where storage went.

Its goal is to make disk usage understandable before cleanup happens. Instead of only showing that a folder is large, zpace should explain what kind of data it contains, why it may exist, and whether it is likely safe to review or remove.

Developer clutter detection is an important differentiator, but it should appear as one strong category inside a general disk exploration product.

## Product Goals

zpace should let users:

- scan a home folder, selected folder, or volume
- see disk usage update while scanning
- explore large folders visually and through sortable lists
- classify space by category, such as applications, documents, media, downloads, trash, caches, system-adjacent space, developer artifacts, and unknown
- identify likely reclaimable storage without assuming every user is a developer
- queue items for cleanup
- review exact paths and sizes before deletion
- move selected items to Trash by default
- re-scan to confirm reclaimed space

## Users

zpace should be useful to:

- people whose Mac is running out of disk space
- power users who want a faster visual way to inspect storage
- developers whose tools create large dependency folders, build outputs, caches, and simulator data

The default experience should be general: scan a location, show the largest items, explain categories, and make cleanup review safe.

## Developer-Specific Strengths

zpace should also be especially good for developers who frequently work with:

- Node, Bun, npm, pnpm, or yarn
- Zig, Rust, Go, or Python
- Docker
- Xcode and iOS simulators
- frontend frameworks and build outputs
- local monorepos and dependency-heavy projects

These users can understand paths and technical explanations, but should not need to manually stitch together `du`, `find`, package-manager cleanup commands, Docker commands, and macOS storage tools every time a disk fills up.

## Core Workflow

```txt
Scan -> Explore -> Understand -> Queue -> Review -> Move to Trash
```

The app should never jump directly from scanning to deletion. Cleanup is a reviewed action, not an automatic side effect.

The primary navigation should not assume a developer workflow. Developer insights should surface naturally when detected.

## Visual Exploration

The main UI concept is an interactive radial disk map:

- the center represents the current folder or volume
- rings represent directory depth
- segments represent child folders and files
- segment size reflects disk usage
- color can communicate category, risk, or depth

The visual map should be paired with list views for users who prefer precise sorting, filtering, and path inspection.

## Scan Reports

After a scan, zpace should summarize:

- total scanned size
- largest folders and files
- likely reclaimable space
- category breakdown
- permission errors
- skipped paths
- scan duration
- file and folder counts

This report gives users both a high-level summary and a practical starting point for cleanup.
