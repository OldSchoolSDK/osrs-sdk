import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { chmod } from "node:fs/promises";

const root = dirname(fileURLToPath(import.meta.url));
await build({
  absWorkingDir: root,
  entryPoints: ["src/cli.mts", "src/index.mts"],
  outdir: "dist",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  packages: "external",
});
await chmod(resolve(root, "dist/cli.js"), 0o755);
