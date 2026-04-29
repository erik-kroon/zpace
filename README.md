# zpace

zpace is a general macOS disk space visualizer and cleaner with unusually good developer storage detection.

It is designed to help answer three practical questions:

1. What is taking up disk space?
2. Why is it there?
3. Can it be safely removed?

The project combines a fast native scanning engine with an interactive UI for exploring disk usage, identifying common cleanup candidates, and reviewing cleanup actions before anything is moved to Trash.

## Why zpace

Most Macs accumulate storage in places that generic cleanup flows do not explain well:

- downloads, installers, archives, and disk images
- large media folders and app support data
- browser, application, and system caches
- Trash and other obvious reclaimable locations
- permission-restricted or skipped areas that make totals confusing
- local snapshots and purgeable space

Developer machines add another layer of hard-to-find storage:

- dependency folders such as `node_modules`
- package manager caches for npm, pnpm, Bun, Cargo, Go, and Python
- Xcode DerivedData and simulator data
- Docker images, volumes, and build cache
- framework output such as `.next`, `dist`, `build`, and `target`
- Homebrew caches, downloads, trash, and other reclaimable folders

zpace treats all of these as first-class storage categories instead of showing every large folder as an unexplained path. Developer clutter is a strong specialty, not the only use case.

## Planned Experience

zpace is planned around a simple flow:

```txt
Scan -> Explore -> Understand -> Queue -> Review -> Move to Trash
```

Core capabilities:

- scan a home folder, selected folder, or volume
- visualize disk usage with an interactive radial map
- navigate through folders with breadcrumbs
- inspect largest files and folders in sortable lists
- classify common storage categories, including apps, media, downloads, caches, system-adjacent space, and developer artifacts
- explain risk level and cleanup recommendations
- queue items for review before deletion
- move selected items to macOS Trash by default
- re-scan to verify reclaimed space

## Safety Model

zpace should be safe by default:

- no automatic deletion
- no permanent deletion by default
- exact paths shown before cleanup
- risky and protected locations flagged before action
- permission-denied and skipped paths reported clearly
- cleanup history retained for the session

See [Safety Model](docs/safety.md) for more detail.

## Architecture Direction

The intended architecture is:

- a Zig scanning engine for fast filesystem traversal
- a shared scan model used by both CLI and GUI flows
- a SolidJS UI with TanStack Router
- a macOS-first cleanup path that moves files to Trash

The command-line interface and graphical interface should share the same engine so the app can support both interactive exploration and scriptable workflows.

## Documentation

- [Overview](docs/overview.md)
- [Safety Model](docs/safety.md)
- [Developer Cleanup Detection](docs/developer-cleanup.md)
- [CLI Concepts](docs/cli.md)
- [Roadmap](docs/roadmap.md)

## Status

This repository is in early product and implementation planning. The documentation describes the intended external behavior, safety principles, and product direction.
