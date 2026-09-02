#!/usr/bin/env node
/* eslint-env node */
/*
 * Node-only boundary around osrscachereader. It deliberately writes decoded payloads,
 * never cache archives or GLTF. The adapter is kept separate because cache reader APIs
 * are revision-sensitive; it must export decodeSample({ cachePath, revision }).
 */
import { createHash } from "node:crypto";
import { mkdir, readdir, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { gzipSync } from "fflate";
import {
  CACHE_RENDER_BUNDLE_SCHEMA_VERSION,
  CACHE_RENDER_PAYLOAD_MAGIC,
  CACHE_RENDER_PAYLOAD_VERSION,
} from "../../src/cache-render-format/index.ts";
import type {
  CacheRenderAsset,
  CacheRenderBundleManifest,
  CacheRenderPayload,
} from "../../src/cache-render-format/index.ts";
import { createSoundEffectPack } from "../sounds/pack.mts";

const [adapterPath, cachePath, outputDirectory] = process.argv.slice(2);
if (!adapterPath || !cachePath || !outputDirectory)
  throw new Error("Usage: extract-cache-render-bundle <osrscachereader-adapter.mjs> <cache-path> <output-dir>");
const adapter = await import(resolve(adapterPath));
if (typeof adapter.decodeSample !== "function")
  throw new Error("Extractor adapter must export decodeSample; implement it with osrscachereader@1.1.3");
const decoded = await adapter.decodeSample({ cachePath, revision: process.env.OSRS_CACHE_REVISION });
if (
  !Number.isInteger(decoded.revision) ||
  !decoded.source ||
  !Array.isArray(decoded.assets) ||
  !decoded.references ||
  !Array.isArray(decoded.soundEffects)
)
  throw new Error("osrscachereader adapter returned an incompatible sample decode");
await mkdir(outputDirectory, { recursive: true });
// Remove payloads from prior extractions so stale content-hashed files do not
// accumulate or remain discoverable alongside the current manifest. Only
// delete files produced by this extractor; leave unrelated files/directories
// in the output directory untouched.
// Payload ids can contain cache location separators (`:`). A leading colon
// makes an otherwise relative name look like a URL scheme to `new URL(...)`,
// so use the content digest as the on-disk/HTTP filename instead. The legacy
// pattern is retained solely to clean bundles written by older extractors.
const generatedFile = /^(?:[a-z0-9][a-z0-9:_-]*\.)?[a-f0-9]{64}\.bin$/i;
const generatedSoundPack = /^cache-sound-effects\.[a-f0-9]{64}\.soundpack$/i;
for (const entry of await readdir(outputDirectory, { withFileTypes: true })) {
  if (
    entry.isFile() &&
    (entry.name === "manifest.json" || generatedFile.test(entry.name) || generatedSoundPack.test(entry.name))
  ) {
    await unlink(resolve(outputDirectory, entry.name));
  }
}
const assets: Record<string, CacheRenderAsset> = {};
for (const asset of decoded.assets.sort((a, b) => a.id.localeCompare(b.id))) {
  if (!asset.id || !Array.isArray(asset.payload.positions)) throw new Error(`Missing geometry for ${asset.id}`);
  const payload: CacheRenderPayload = { version: CACHE_RENDER_PAYLOAD_VERSION, ...asset.payload };
  const json = Buffer.from(JSON.stringify(payload));
  const compressed = Buffer.from(gzipSync(json, { level: 6 }));
  const bytes = Buffer.concat([
    Buffer.from(CACHE_RENDER_PAYLOAD_MAGIC),
    Buffer.from(Uint32Array.of(compressed.length).buffer),
    compressed,
  ]);
  const hash = createHash("sha256").update(bytes).digest("hex");
  const file = `${hash}.bin`;
  await writeFile(resolve(outputDirectory, file), bytes);
  assets[asset.id] = { file, sha256: hash, bytes: bytes.length };
}
const soundPackBytes = Buffer.from(createSoundEffectPack(decoded.soundEffects));
const soundPackHash = createHash("sha256").update(soundPackBytes).digest("hex");
const soundEffects: CacheRenderAsset = {
  file: `cache-sound-effects.${soundPackHash}.soundpack`,
  sha256: soundPackHash,
  bytes: soundPackBytes.length,
};
await writeFile(resolve(outputDirectory, soundEffects.file), soundPackBytes);
const sourceHash = createHash("sha256")
  .update(
    JSON.stringify({
      assets,
      references: decoded.references,
      scenes: decoded.scenes,
      playerItems: decoded.playerItems,
      spotAnims: decoded.spotAnims,
      sharedAssets: decoded.sharedAssets,
      soundEffects,
    }),
  )
  .digest("hex");
const manifest: CacheRenderBundleManifest = {
  schemaVersion: CACHE_RENDER_BUNDLE_SCHEMA_VERSION,
  bundleVersion: `osrs-${decoded.revision}-${sourceHash.slice(0, 12)}`,
  cache: { revision: decoded.revision, source: decoded.source, contentHash: sourceHash },
  assets,
  references: decoded.references,
  ...(decoded.scenes ? { scenes: decoded.scenes } : {}),
  ...(decoded.playerItems ? { playerItems: decoded.playerItems } : {}),
  ...(decoded.spotAnims ? { spotAnims: decoded.spotAnims } : {}),
  ...(decoded.sharedAssets ? { sharedAssets: decoded.sharedAssets } : {}),
  soundEffects,
};
await writeFile(resolve(outputDirectory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(
  `Wrote ${Object.keys(assets).length} cache render payloads and ${decoded.soundEffects.length} sound effects for revision ${decoded.revision}`,
);
