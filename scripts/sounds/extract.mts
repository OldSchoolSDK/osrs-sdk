/* eslint-env node */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadReader } from "../../packages/osrs-sdk-assets/src/reader.mts";
import { loadConfig } from "../../packages/osrs-sdk-assets/dist/index.js";
import { createSoundEffectPack } from "./pack.mts";

const cachePath = process.argv[2];
const outputPath = process.argv[3] ?? "cache-render-bundle/cache-sound-effects.soundpack";
if (!cachePath) throw new Error("Usage: npm run extract:sounds -- <cache-path> [output-file]");

const config = await loadConfig();
const { RSCache, IndexType } = await loadReader(config.readerPath);
const soundIds = [...new Set(Object.values(config.assets.sounds).map(({ id }) => id))];
const cache = new RSCache(cachePath);
await cache.onload;
try {
  const entries: Array<{ id: number; bytes: Uint8Array }> = [];
  for (const id of soundIds) {
    const file = await cache.getFile(IndexType.SOUNDEFFECTS, id, 0, { cacheResults: false });
    const bytes = Uint8Array.from(file.def.bytes);
    entries.push({ id, bytes });
  }
  const output = createSoundEffectPack(entries);

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, output);
  console.log(`Wrote ${entries.length} sound effects (${output.length} bytes) to ${outputPath}`);
} finally {
  cache.close();
}
