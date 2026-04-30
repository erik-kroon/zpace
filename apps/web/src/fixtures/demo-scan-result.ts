import { scanResultSchema, type ScanClassification, type ScanNode } from "@zpace/scanner/src/schema";

const GB = 1024 ** 3;

const gb = (value: number) => Math.round(value * GB);

const usuallySafe = (category: string, recommendation: string): ScanClassification => ({
  category,
  explanation: recommendation,
  risk: "medium",
  recommendation,
  isProtected: false,
  protectionReason: null,
});

const reviewFirst = (category: string, recommendation: string): ScanClassification => ({
  category,
  explanation: recommendation,
  risk: "high",
  recommendation,
  isProtected: false,
  protectionReason: null,
});

function directory(
  path: string,
  name: string,
  logicalSize: number,
  children: ScanNode[],
  classification: ScanNode["classification"] = null,
): ScanNode {
  return {
    path,
    name,
    type: "directory",
    logicalSize,
    allocatedSize: null,
    childCount: children.length,
    omittedChildCount: 0,
    childrenTruncated: false,
    status: "complete",
    classification,
    children,
  };
}

function file(path: string, name: string, logicalSize: number): ScanNode {
  return {
    path,
    name,
    type: "file",
    logicalSize,
    allocatedSize: logicalSize,
    childCount: 0,
    omittedChildCount: 0,
    childrenTruncated: false,
    status: "complete",
    classification: null,
    children: [],
  };
}

const derivedData = directory(
  "/Users/erik/Library/Developer/Xcode/DerivedData",
  "DerivedData",
  gb(18.4),
  [
    directory("/Users/erik/Library/Developer/Xcode/DerivedData/zpace-a1", "zpace-a1", gb(8.8), []),
    directory("/Users/erik/Library/Developer/Xcode/DerivedData/Preview-b2", "Preview-b2", gb(5.6), []),
    directory("/Users/erik/Library/Developer/Xcode/DerivedData/Index-c3", "Index-c3", gb(4), []),
  ],
  usuallySafe("Developer artifacts", "Xcode can rebuild DerivedData. Remove it when no build is running."),
);

const library = directory("/Users/erik/Library", "Library", gb(83.6), [
  directory("/Users/erik/Library/Developer", "Developer", gb(34.7), [
    derivedData,
    directory("/Users/erik/Library/Developer/CoreSimulator", "CoreSimulator", gb(13.5), [
      directory("/Users/erik/Library/Developer/CoreSimulator/Devices", "Devices", gb(10.2), []),
      directory("/Users/erik/Library/Developer/CoreSimulator/Caches", "Caches", gb(3.3), []),
    ], reviewFirst("Developer artifacts", "Simulator data can include app state. Review before removing.")),
    directory("/Users/erik/Library/Developer/Archives", "Archives", gb(2.8), []),
  ]),
  directory("/Users/erik/Library/Containers", "Containers", gb(20.1), [
    directory("/Users/erik/Library/Containers/com.docker.docker", "Docker", gb(14.4), []),
    directory("/Users/erik/Library/Containers/com.apple.mail", "Mail", gb(5.7), []),
  ]),
  directory("/Users/erik/Library/Caches", "Caches", gb(17.9), [
    directory("/Users/erik/Library/Caches/Homebrew", "Homebrew", gb(6.5), [], usuallySafe("Caches", "Homebrew cache is usually safe to clean.")),
    directory("/Users/erik/Library/Caches/pnpm", "pnpm", gb(4.3), [], usuallySafe("Dependencies", "Package manager cache can be rebuilt.")),
    directory("/Users/erik/Library/Caches/Playwright", "Playwright", gb(3.1), [], usuallySafe("Caches", "Browser test cache can be downloaded again.")),
    directory("/Users/erik/Library/Caches/Other", "Other", gb(4), []),
  ]),
  directory("/Users/erik/Library/Application Support", "Application Support", gb(10.9), []),
]);

const projects = directory("/Users/erik/Projects", "Projects", gb(34.2), [
  directory("/Users/erik/Projects/zpace", "zpace", gb(12.8), [
    directory("/Users/erik/Projects/zpace/node_modules", "node_modules", gb(5.4), [], usuallySafe("Dependencies", "Installed dependencies can be restored with the package manager.")),
    directory("/Users/erik/Projects/zpace/.turbo", ".turbo", gb(2.1), [], usuallySafe("Developer artifacts", "Build cache is usually safe to clean.")),
    directory("/Users/erik/Projects/zpace/apps", "apps", gb(3.5), []),
    directory("/Users/erik/Projects/zpace/packages", "packages", gb(1.8), []),
  ]),
  directory("/Users/erik/Projects/client-app", "client-app", gb(9.4), [
    directory("/Users/erik/Projects/client-app/node_modules", "node_modules", gb(6.2), [], usuallySafe("Dependencies", "Installed dependencies can be restored with the package manager.")),
    directory("/Users/erik/Projects/client-app/.next", ".next", gb(1.7), [], usuallySafe("Developer artifacts", "Next.js build output can be regenerated.")),
    directory("/Users/erik/Projects/client-app/src", "src", gb(1.5), []),
  ]),
  directory("/Users/erik/Projects/archive", "archive", gb(7.6), []),
  directory("/Users/erik/Projects/tools", "tools", gb(4.4), []),
]);

const pictures = directory("/Users/erik/Pictures", "Pictures", gb(22.3), [
  directory("/Users/erik/Pictures/Photos Library.photoslibrary", "Photos Library", gb(19.6), []),
  directory("/Users/erik/Pictures/Screenshots", "Screenshots", gb(2.7), []),
]);

const downloads = directory("/Users/erik/Downloads", "Downloads", gb(9.5), [
  file("/Users/erik/Downloads/Xcode_16.xip", "Xcode_16.xip", gb(4.8)),
  file("/Users/erik/Downloads/recording.mov", "recording.mov", gb(2.4)),
  directory("/Users/erik/Downloads/installers", "installers", gb(2.3), []),
]);

const rootChildren = [
  library,
  projects,
  pictures,
  downloads,
  directory("/Users/erik/Desktop", "Desktop", gb(6.1), [
    file("/Users/erik/Desktop/demo-export.mov", "demo-export.mov", gb(3.9)),
    directory("/Users/erik/Desktop/archive", "archive", gb(2.2), []),
  ]),
  directory("/Users/erik/Documents", "Documents", gb(5.7), []),
  directory("/Users/erik/.cache", ".cache", gb(4.9), [
    directory("/Users/erik/.cache/bun", "bun", gb(2.8), [], usuallySafe("Caches", "Bun cache can be rebuilt.")),
    directory("/Users/erik/.cache/rust", "rust", gb(2.1), [], usuallySafe("Developer artifacts", "Rust build cache can be rebuilt.")),
  ]),
];

export const demoScanResult = scanResultSchema.parse({
  schemaVersion: 1,
  root: directory("/Users/erik", "erik", gb(166.4), rootChildren),
  summary: {
    totalLogicalSize: gb(166.4),
    totalAllocatedSize: gb(158.9),
    likelyReclaimableSize: gb(47.8),
    fileCount: 183_420,
    folderCount: 28_940,
    warningCount: 0,
    inaccessibleCount: 0,
    skippedCount: 0,
    protectedCount: 0,
    freeSize: gb(82.4),
    purgeableSize: gb(12.7),
    durationMs: 6200,
    largestItems: rootChildren.map((node) => ({
      path: node.path,
      name: node.name,
      type: node.type,
      logicalSize: node.logicalSize,
      classification: node.classification,
    })),
    categories: [
      { category: "Developer artifacts", logicalSize: gb(38.6), itemCount: 9, likelyReclaimableSize: gb(29.1) },
      { category: "Dependencies", logicalSize: gb(15.9), itemCount: 3, likelyReclaimableSize: gb(15.9) },
      { category: "Caches", logicalSize: gb(17.7), itemCount: 5, likelyReclaimableSize: gb(13.4) },
      { category: "Media", logicalSize: gb(31.1), itemCount: 4, likelyReclaimableSize: 0 },
      { category: "Unknown", logicalSize: gb(63.1), itemCount: 12, likelyReclaimableSize: 0 },
    ],
  },
  diagnostics: [],
});
