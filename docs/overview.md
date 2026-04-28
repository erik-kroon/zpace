# Overview

zpace is a macOS disk space visualizer and cleaner built for developers and power users.

Its goal is to make disk usage understandable before cleanup happens. Instead of only showing that a folder is large, zpace should explain what kind of data it contains, why it may exist, and whether it is likely safe to remove.

## Product Goals

zpace should let users:

- scan a home folder, selected folder, or volume
- see disk usage update while scanning
- explore large folders visually and through sortable lists
- classify space by category, such as development artifacts, caches, media, applications, downloads, trash, system, and unknown
- identify likely reclaimable development storage
- queue items for cleanup
- review exact paths and sizes before deletion
- move selected items to Trash by default
- re-scan to confirm reclaimed space

## Primary Users

zpace is designed for developers who frequently work with:

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
