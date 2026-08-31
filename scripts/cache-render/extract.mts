#!/usr/bin/env node
/*
 * Node-only boundary around osrscachereader. It deliberately writes decoded payloads,
 * never cache archives or GLTF. The adapter is kept separate because cache reader APIs
 * are revision-sensitive; it must export decodeSample({ cachePath, revision }).
 */
import { createHash } from "node:crypto";
import { mkdir, readdir, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { gzipSync } from "fflate";

const [adapterPath, cachePath, outputDirectory] = process.argv.slice(2);
if (!adapterPath || !cachePath || !outputDirectory) throw new Error("Usage: extract-cache-render-bundle <osrscachereader-adapter.mjs> <cache-path> <output-dir>");
const adapter = await import(resolve(adapterPath));
if (typeof adapter.decodeSample !== "function") throw new Error("Extractor adapter must export decodeSample; implement it with osrscachereader@1.1.3");
const decoded = await adapter.decodeSample({ cachePath, revision: process.env.OSRS_CACHE_REVISION });
if (!Number.isInteger(decoded.revision) || !decoded.source || !Array.isArray(decoded.assets) || !decoded.references) throw new Error("osrscachereader adapter returned an incompatible sample decode");
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
for (const entry of await readdir(outputDirectory, { withFileTypes: true })) {
  if (entry.isFile() && (entry.name === "manifest.json" || generatedFile.test(entry.name))) {
    await unlink(resolve(outputDirectory, entry.name));
  }
}
const assets = {};
for (const asset of decoded.assets.sort((a, b) => a.id.localeCompare(b.id))) {
  if (!asset.id || !Array.isArray(asset.payload.positions)) throw new Error(`Missing geometry for ${asset.id}`);
  const json = Buffer.from(JSON.stringify({ version: 1, ...asset.payload }));
  const compressed = Buffer.from(gzipSync(json, { level: 6 }));
  const bytes = Buffer.concat([Buffer.from("OSRB"), Buffer.from(Uint32Array.of(compressed.length).buffer), compressed]);
  const hash = createHash("sha256").update(bytes).digest("hex");
  const file = `${hash}.bin`;
  await writeFile(resolve(outputDirectory, file), bytes);
  assets[asset.id] = { file, sha256: hash, bytes: bytes.length };
}
const sourceHash = createHash("sha256").update(JSON.stringify({ assets, references: decoded.references, scenes: decoded.scenes, playerItems: decoded.playerItems, spotAnims: decoded.spotAnims, sharedAssets: decoded.sharedAssets })).digest("hex");
const manifest = { schemaVersion: 1, bundleVersion: `osrs-${decoded.revision}-${sourceHash.slice(0, 12)}`, cache: { revision: decoded.revision, source: decoded.source, contentHash: sourceHash }, assets, references: decoded.references, ...(decoded.scenes ? { scenes: decoded.scenes } : {}), ...(decoded.playerItems ? { playerItems: decoded.playerItems } : {}), ...(decoded.spotAnims ? { spotAnims: decoded.spotAnims } : {}), ...(decoded.sharedAssets ? { sharedAssets: decoded.sharedAssets } : {}) };
await writeFile(resolve(outputDirectory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Wrote ${Object.keys(assets).length} cache render payloads for revision ${decoded.revision}`);
