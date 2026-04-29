# Developer Cleanup Detection

Developer cleanup detection is one specialized category inside zpace's broader storage classification system.

Developer storage is often scattered across project folders, user caches, toolchains, simulators, package stores, and build outputs. zpace should identify these patterns and explain them in plain language, while still treating downloads, media, applications, caches, Trash, and other general storage categories as first-class parts of the product.

## Initial Categories

Planned developer detector categories:

- Node dependencies
- package manager caches
- Xcode build artifacts
- iOS simulator data
- Docker storage
- Rust build outputs
- Zig build outputs
- Go module cache
- Python virtual environments and caches
- frontend framework caches
- Homebrew cache
- generic build output
General categories such as downloads and trash are tracked by the broader scanner/reporting model, not only by the developer detector.

## Initial Path Patterns

Common targets include:

```txt
**/node_modules
**/.next
**/dist
**/build
**/target
**/.zig-cache
**/zig-out
~/Library/Developer/Xcode/DerivedData
~/Library/Developer/CoreSimulator
~/Library/Caches
~/.cache
~/.npm
~/.pnpm-store
~/.bun
~/.cargo/registry
~/.cargo/git
~/go/pkg/mod
```

These patterns should be treated as signals, not unconditional deletion rules. They should feed the same cleanup candidate flow used for general storage.

## Recommendations

Each detected item should include:

- category
- size
- path
- reason it exists
- whether it is usually regenerated
- risk level
- recommended cleanup method

The UI should label this as developer storage, not as the whole cleanup experience.

Example:

```txt
Path: ~/Library/Developer/Xcode/DerivedData
Category: Xcode build artifacts
Risk: Low
Reason: Cached build output created by Xcode.
Recommendation: Usually safe to remove when Xcode is closed.
Action: Move to Trash.
```

## Project-Level Insight

For development projects, zpace should eventually summarize storage by project:

```txt
Project total: 4.2 GB
node_modules: 2.1 GB
.next: 900 MB
dist: 400 MB
.git: 300 MB
coverage: 120 MB
```

This helps users decide whether to clean a generated folder, archive a project, or keep the project intact.

## Rules

Later versions may support user-defined rules such as:

- mark `node_modules` older than 30 days as low risk
- ignore selected client or work folders
- never clean anything inside `~/Documents`
- surface `.next` folders larger than a chosen threshold

Rules should make recommendations more personal without removing the review step.
