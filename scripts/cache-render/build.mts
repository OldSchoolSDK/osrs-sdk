#!/usr/bin/env node
// Builds the configured asset bundle; a positional cache ID overrides the config.
const args = process.argv.slice(2);
if (/^\d+$/.test(args[0] ?? "")) args.splice(0, 1, "--cache", args[0]);
process.argv.splice(2, process.argv.length - 2, "build", ...args);
await import("../../packages/osrs-sdk-assets/dist/cli.js");
