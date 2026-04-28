# Roadmap

This roadmap describes the intended product direction. It is not a release commitment.

## MVP

The first usable version should focus on safe local scanning and reviewed cleanup.

Planned MVP scope:

- scan home directory, selected folders, and accessible volumes
- stream scan progress to the UI
- show an interactive radial usage map
- provide breadcrumb navigation
- list largest folders and files
- show category breakdowns
- detect common developer artifacts and caches
- maintain a cleanup queue
- move selected items to Trash
- show scan reports with warnings and skipped paths

## Near-Term Improvements

After the MVP, useful additions include:

- stronger Docker storage reporting
- guided Homebrew cleanup recommendations
- simulator cleanup guidance
- local snapshot visibility where available
- historical scan comparison
- project-level storage summaries
- better filtering and search

## Duplicate Finder

A later mode may detect duplicate files using:

- file size bucketing
- partial hashing
- full hashing
- inode awareness

Duplicate detection should be separate from the core cleanup flow because the safety and review requirements are different.

## Historical Scans

Historical scan support could show how storage changes over time:

```txt
Today: node_modules 28 GB
Last week: node_modules 17 GB
Change: +11 GB
```

This helps identify fast-growing caches, build outputs, and projects.

## Cleanup Integrations

Some tools have their own cleanup commands. zpace may eventually guide users through actions such as Docker cleanup, Homebrew cleanup, simulator cleanup, and local snapshot inspection.

Because these operations can be destructive or surprising, they should begin as guided actions with clear explanations, not automatic background cleanup.
