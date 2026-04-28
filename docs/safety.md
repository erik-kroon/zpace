# Safety Model

zpace should make cleanup deliberate, reversible where possible, and easy to audit.

## Defaults

Default cleanup behavior:

- move files and folders to macOS Trash
- require explicit confirmation
- show total size, item count, and exact paths before cleanup
- disable cleanup actions when the queue is empty
- warn on risky or protected paths
- report failures without continuing silently

Permanent deletion should not be the default behavior.

## Cleanup Queue

Users should collect items into a queue before cleanup.

The queue should show:

- item path
- item type
- estimated size
- category
- risk level
- recommendation
- total reclaimable size

Users should be able to remove individual items from the queue before confirming.

## Risk Levels

Suggested risk levels:

| Risk | Meaning | Example |
| --- | --- | --- |
| Low | Commonly regenerated cache or build output | `DerivedData`, `.next`, `target` |
| Medium | Usually removable, but may affect active projects or tools | old `node_modules`, package caches |
| High | Could remove source data, configuration, or important user files | project folders, documents |
| Protected | Should not be offered for normal cleanup | system paths, restricted OS locations |

Risk should be based on both path patterns and surrounding context. A folder name alone is not always enough.

## Protected Paths

zpace should avoid normal cleanup actions for protected or sensitive areas, including:

- macOS system directories
- security-sensitive system locations
- user documents unless explicitly selected
- mounted volumes that are not part of the intended scan
- paths with unclear ownership or permission state

When a path cannot be scanned, zpace should report it as inaccessible rather than guessing.

## Permissions

Some folders require Full Disk Access or elevated permissions to inspect. zpace should distinguish:

- scanned space
- inaccessible space
- skipped paths
- free space
- purgeable space, where available

Permission warnings should explain what was not scanned and why the result may be incomplete.

## Destructive Commands

Some ecosystem cleanup commands can remove useful local state. Examples include Docker prune commands, simulator deletion, local snapshot management, and package manager cleanup commands.

For these actions, zpace should initially provide guided recommendations rather than running destructive commands automatically.
