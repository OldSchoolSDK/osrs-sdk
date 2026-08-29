#!/usr/bin/env node
/* Downloads a complete OSRS cache in disk-store form for the local render extractor. */
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { unzipSync } from "fflate";

const execFileAsync = promisify(execFile);
async function json(url) {
  const { stdout } = await execFileAsync("curl", ["--fail", "--location", "--silent", "--show-error", "--retry", "3", "--connect-timeout", "30", url], { maxBuffer: 20 * 1024 * 1024 });
  return JSON.parse(stdout);
}
async function download(url, destination) {
  await execFileAsync("curl", ["--fail", "--location", "--silent", "--show-error", "--retry", "3", "--connect-timeout", "30", "--output", destination, url]);
}
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const requestedId = process.argv[2] ? Number(process.argv[2]) : undefined;
if (requestedId !== undefined && (!Number.isSafeInteger(requestedId) || requestedId < 1)) throw new Error("Cache id must be a positive OpenRS2 cache id");

const caches = await json("https://archive.openrs2.org/caches.json");
const complete = (cache) => cache.game === "oldschool" && cache.environment === "live" && cache.language === "en" &&
  cache.disk_store_valid === true && cache.valid_indexes === cache.indexes && cache.valid_groups === cache.groups;
const selected = requestedId === undefined
  ? caches.filter(complete).sort((a, b) => (Date.parse(b.timestamp || "") || 0) - (Date.parse(a.timestamp || "") || 0) || b.id - a.id)[0]
  : caches.find((cache) => cache.id === requestedId && complete(cache));
if (!selected) throw new Error(requestedId ? `OpenRS2 cache ${requestedId} is not a complete live OSRS cache` : "No complete live OSRS cache is available");

const destination = resolve(repositoryRoot, ".cache-render", "openrs2", String(selected.id));
const metadataPath = resolve(destination, "openrs2.json");
try {
  const previous = JSON.parse(await readFile(metadataPath, "utf8"));
  await access(resolve(destination, "cache"));
  if (previous.id === selected.id) {
    console.log(`Using cached OpenRS2 cache ${selected.id}: ${resolve(destination, "cache")}`);
    process.exit(0);
  }
} catch { /* cache has not been downloaded yet */ }
await mkdir(destination, { recursive: true });
const zipPath = resolve(destination, "disk.zip");
await download(`https://archive.openrs2.org/caches/${selected.scope}/${selected.id}/disk.zip`, zipPath);
const archive = unzipSync(new Uint8Array(await readFile(zipPath)));
const cacheDirectory = resolve(destination, "cache");
// Extraction is repeatable, including after an interrupted/older extraction left
// a file where the ZIP expects the cache directory.
await rm(cacheDirectory, { recursive: true, force: true });
for (const [entry, contents] of Object.entries(archive)) {
  if (!entry.startsWith("cache/") || entry.includes("..") || entry.startsWith("/")) throw new Error(`Unexpected path in OpenRS2 archive: ${entry}`);
  const target = resolve(destination, entry);
  if (entry.endsWith("/")) await mkdir(target, { recursive: true });
  else {
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, contents);
  }
}
await writeFile(metadataPath, `${JSON.stringify({ ...selected, downloadedAt: new Date().toISOString() }, null, 2)}\n`);
console.log(`Downloaded OpenRS2 cache ${selected.id} to ${resolve(destination, "cache")}`);
