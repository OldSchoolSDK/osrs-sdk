import { build } from "esbuild";
await build({
  entryPoints: ["asset-manifest.ts"],
  outfile: "asset-manifest.js",
  bundle: true,
  platform: "neutral",
  format: "cjs",
  target: "es2020",
});
