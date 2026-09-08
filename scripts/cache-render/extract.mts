#!/usr/bin/env node
// SDK-repository command that builds the configured client asset bundle.
process.argv.splice(2, 0, "build");
await import("../../packages/osrs-sdk-assets/dist/cli.js");
