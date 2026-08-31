#!/usr/bin/env node
/* One-command developer workflow: download a pinned/latest OpenRS2 cache, then extract assets. */
import { readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const run = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultAdapter = resolve(root, "scripts/osrs-cache-adapter.mjs");
const args = process.argv.slice(2);
const requestedId = /^\d+$/.test(args[0] || "") ? args[0] : args[1];
const adapterPath = /^\d+$/.test(args[0] || "") || !args[0] ? defaultAdapter : resolve(args[0]);
const downloader = resolve(root, "scripts/download-openrs2-cache.mjs");
await run(process.execPath, [downloader, ...(requestedId ? [requestedId] : [])], { cwd: root, stdio: "inherit" });
const metadataRoot = resolve(root, ".cache-render", "openrs2");
let id = requestedId || (await readFile(resolve(metadataRoot, "latest"), "utf8").catch(() => "")).trim();
if (!id) {
  // The downloader stores metadata in the selected ID directory; discover the newest one
  // without relying on shell commands or platform-specific directory sorting.
  const { readdir } = await import("node:fs/promises");
  const candidates = await readdir(metadataRoot, { withFileTypes: true });
  const records = await Promise.all(candidates.filter((entry) => entry.isDirectory()).map(async (entry) => {
    try { return JSON.parse(await readFile(resolve(metadataRoot, entry.name, "openrs2.json"), "utf8")); } catch { return null; }
  }));
  const selected = records.filter(Boolean).sort((a, b) => String(b.downloadedAt).localeCompare(String(a.downloadedAt)))[0];
  if (!selected) throw new Error("Downloader completed but no cache metadata was found");
  id = String(selected.id);
}
const metadata = JSON.parse(await readFile(resolve(metadataRoot, String(id), "openrs2.json"), "utf8"));
const revision = metadata.builds?.[0]?.major ?? id;
await run(process.execPath, [resolve(root, "scripts/extract-cache-render-bundle.mjs"), adapterPath, resolve(metadataRoot, String(id), "cache"), resolve(root, "cache-render-bundle")], { cwd: root, stdio: "inherit", env: { ...process.env, OSRS_CACHE_REVISION: String(revision), OSRS_CACHE_SOURCE: `openrs2:${id}` } });
