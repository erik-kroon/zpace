import type { ElectrobunConfig } from "electrobun";

const webBuildDir = "../web/dist";
const scannerExecutable = "../../packages/scanner/native/zig-out/bin/zpace-scanner";

export default {
  app: {
    name: "zpace",
    identifier: "dev.bettertstack.zpace.desktop",
    version: "0.0.1",
  },
  runtime: {
    exitOnLastWindowClosed: true,
  },
  build: {
    bun: {
      entrypoint: "src/bun/index.ts",
    },
    copy: {
      [webBuildDir]: "views/mainview",
      [scannerExecutable]: "scanner/zpace-scanner",
    },
    watchIgnore: [`${webBuildDir}/**`],
    mac: {
      bundleCEF: false,
      defaultRenderer: "native",
    },
    linux: {
      bundleCEF: true,
      defaultRenderer: "cef",
    },
    win: {
      bundleCEF: true,
      defaultRenderer: "cef",
    },
  },
} satisfies ElectrobunConfig;
