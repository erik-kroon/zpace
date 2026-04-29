# CLI Concepts

zpace should support both graphical and command-line workflows through the same scanning engine.

The CLI is intended for quick inspection, automation, and workflows where opening the full UI is unnecessary.

## Planned Commands

Example command shape:

```bash
zpace scan ~
zpace scan ~/Projects
zpace cleanup-candidates
zpace developer-storage
zpace serve
```

These commands are conceptual until the CLI is implemented.

## `zpace scan`

Scans a path and reports disk usage.

Expected output should include:

- total scanned size
- largest folders and files
- category breakdown
- scan duration
- warnings for skipped or inaccessible paths

Useful options may include:

```bash
zpace scan ~/Projects --json
zpace scan ~ --max-depth 4
zpace scan / --include-hidden
```

## `zpace cleanup-candidates`

Finds likely cleanup candidates across general storage categories.

Expected output should include:

- path
- category
- size
- risk level
- recommendation

The command should not delete by default.

## `zpace developer-storage`

Lists detected developer artifacts and caches as a focused view for technical users.

This should be a convenience command, not the primary product model. The general cleanup flow should remain useful to non-developers.

## `zpace serve`

Starts a local UI backed by the scanner.

This can be useful during development, for local browser-based inspection, or for environments where the desktop wrapper is not available.

## Output Formats

The CLI should eventually support structured output for automation:

```bash
zpace scan ~/Projects --json
zpace cleanup-candidates --json
zpace developer-storage --json
```

JSON output should use the same data model as the UI so reports, automation, and visual exploration remain consistent.

## Cleanup from CLI

CLI cleanup should follow the same safety model as the GUI:

- show exact paths
- require confirmation by default
- move to Trash where supported
- avoid protected paths
- support dry-run output

Example future shape:

```bash
zpace clean --from-report report.json --dry-run
zpace clean --from-report report.json
```
