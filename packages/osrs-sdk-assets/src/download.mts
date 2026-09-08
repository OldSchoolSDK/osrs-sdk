import { access, mkdir, readFile, rename, rm, writeFile, mkdtemp, open, unlink } from "node:fs/promises";
import { resolve, dirname, sep } from "node:path";
import { unzipSync } from "fflate";

export function validateCacheId(id) {
  if (!Number.isSafeInteger(id) || id < 1) throw new Error("cache.openrs2 must be a pinned positive OpenRS2 cache ID");
}

async function request(url) {
  let failure;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(300_000) });
      if (!response.ok) throw new Error(`HTTP ${response.status} downloading ${url}`);
      return new Uint8Array(await response.arrayBuffer());
    } catch (error) {
      failure = error;
    }
  }
  throw failure;
}

export function archiveTarget(root, entry) {
  if (!entry.startsWith("cache/") || entry.includes("\\") || entry.split("/").includes(".."))
    throw new Error(`Unexpected cache archive path ${entry}`);
  const target = resolve(root, entry);
  if (!target.startsWith(root + sep)) throw new Error(`Unexpected cache archive path ${entry}`);
  return target;
}

export async function acquireCache(cacheId, cacheRoot) {
  validateCacheId(cacheId);
  const destination = resolve(cacheRoot, String(cacheId));
  const cachePath = resolve(destination, "cache");
  // Check disk first: a pinned, complete local cache requires no network access.
  try {
    const metadata = JSON.parse(await readFile(resolve(destination, "openrs2.json"), "utf8"));
    if (metadata.id !== cacheId || !Number.isSafeInteger(metadata.builds?.[0]?.major))
      throw new Error("Invalid cached metadata");
    await Promise.all(
      ["xteas.json", "main_file_cache.dat2", "main_file_cache.idx255"].map((file) => access(resolve(cachePath, file))),
    );
    console.log(`Using cached OpenRS2 cache ${cacheId}: ${cachePath}`);
    return { cachePath, metadata };
  } catch {
    /* Missing or interrupted extraction: download into a staging directory. */
  }
  await mkdir(cacheRoot, { recursive: true });
  const lockPath = resolve(cacheRoot, `.download-${cacheId}.lock`);
  let lock;
  try {
    lock = await open(lockPath, "wx");
  } catch (error) {
    throw new Error(
      `Cache download is locked: ${lockPath}. Retry after the other download finishes; remove the lock only if that process has stopped.`,
      { cause: error },
    );
  }
  try {
    const records = JSON.parse(new TextDecoder().decode(await request("https://archive.openrs2.org/caches.json")));
    const metadata = records.find(
      (cache) => cache.id === cacheId && cache.game === "oldschool" && cache.disk_store_valid === true,
    );
    if (!metadata || !Number.isSafeInteger(metadata.builds?.[0]?.major))
      throw new Error(`OpenRS2 cache ${cacheId} is not an available Old School disk-store cache with a revision`);
    await mkdir(cacheRoot, { recursive: true });
    const staging = await mkdtemp(resolve(cacheRoot, `.download-${cacheId}-`));
    try {
      console.log(`Downloading OpenRS2 cache ${cacheId}`);
      const archive = unzipSync(
        await request(`https://archive.openrs2.org/caches/${metadata.scope}/${cacheId}/disk.zip`),
      );
      for (const [entry, contents] of Object.entries(archive)) {
        const target = archiveTarget(staging, entry);
        if (entry.endsWith("/")) await mkdir(target, { recursive: true });
        else {
          await mkdir(dirname(target), { recursive: true });
          await writeFile(target, contents);
        }
      }
      const keys = await request(`https://archive.openrs2.org/caches/${metadata.scope}/${cacheId}/keys.json`);
      if (!Array.isArray(JSON.parse(new TextDecoder().decode(keys)))) throw new Error("Invalid OpenRS2 keys response");
      await writeFile(resolve(staging, "cache/xteas.json"), keys);
      await Promise.all(
        ["main_file_cache.dat2", "main_file_cache.idx255"].map((file) => access(resolve(staging, "cache", file))),
      );
      await writeFile(
        resolve(staging, "openrs2.json"),
        JSON.stringify({ ...metadata, downloadedAt: new Date().toISOString() }, null, 2),
      );
      // Only this cache ID's managed directory can be replaced.
      await rm(destination, { recursive: true, force: true });
      await rename(staging, destination);
      return { cachePath, metadata };
    } finally {
      await rm(staging, { recursive: true, force: true });
    }
  } finally {
    await lock.close();
    await unlink(lockPath);
  }
}
