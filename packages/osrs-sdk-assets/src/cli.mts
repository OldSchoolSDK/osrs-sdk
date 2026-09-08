#!/usr/bin/env node
import { buildAssets, loadConfig } from "./index.mts";
import { acquireCache } from "./download.mts";

async function main() {
  const [command = "help", ...args] = process.argv.slice(2);
  if (["help", "--help", "-h"].includes(command)) {
    console.log(`Usage: osrs-sdk-assets <build|download> [options]

  build       Merge SDK/client requirements, acquire pinned cache, write assets
  download    Acquire the configured cache without extracting assets

  --config <file>    Configuration file (default: osrs-assets.config.ts)
  --cache <id>       Explicit OpenRS2 cache ID for this invocation
  --cache-dir <dir>  Download cache directory, relative to the config
  --reader-path <dir> Local osrscachereader checkout (default: ../osrscachereader)
  --out-dir <dir>    Output directory, relative to the config

Builds never select latest implicitly. Commit your cache ID and npm lockfile.`);
    return;
  }
  if (!["build", "download"].includes(command)) throw new Error(`Unknown command ${command}`);
  const options = {};
  const flags = {
    "--config": "config",
    "--cache": "cacheId",
    "--cache-dir": "cacheDir",
    "--reader-path": "readerPath",
    "--out-dir": "outDir",
  };
  for (let index = 0; index < args.length; index += 2) {
    const key = flags[args[index]],
      value = args[index + 1];
    if (!key || !value || value.startsWith("--")) throw new Error(`Invalid option ${args[index]}; run --help`);
    options[key] = key === "cacheId" ? Number(value) : value;
  }
  if (command === "build") await buildAssets(options);
  else {
    const config = await loadConfig(options);
    await acquireCache(config.cacheId, config.cacheDir);
  }
}

main().catch((error) => {
  console.error(error.stack ?? error);
  process.exitCode = 1;
});
