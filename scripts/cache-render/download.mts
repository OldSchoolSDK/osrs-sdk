#!/usr/bin/env node
// Downloads the configured cache; a positional cache ID overrides the config.
const args = process.argv.slice(2);
if (/^\d+$/.test(args[0] ?? "")) args.splice(0, 1, "--cache", args[0]);
process.argv.splice(2, process.argv.length - 2, "download", ...args);
await import("../../packages/osrs-sdk-assets/dist/cli.js");
