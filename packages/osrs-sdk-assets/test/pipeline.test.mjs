import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, mkdir, rm, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { zipSync, strToU8 } from "fflate";
import { mergeAssets, uniqueEntries } from "../src/manifest.mts";
import { applySceneTouchups, validateScenes } from "../src/scene-touchups.mts";
import { acquireCache, archiveTarget } from "../src/download.mts";
import { writeBundle } from "../src/write-bundle.mts";
import { loadConfig } from "../src/index.mts";
import { loadReader } from "../src/reader.mts";

test("loads the selected reader checkout", async () => {
  const root = await mkdtemp(join(tmpdir(), "osrs-reader-test-"));
  try {
    await assert.rejects(loadReader(root), /Cannot load cache reader/);
    await mkdir(join(root, "src"));
    await writeFile(join(root, "package.json"), '{"type":"module"}');
    await writeFile(join(root, "src/reader.js"), 'export class RSCache {} export const IndexType = { marker: "local" }; export const ConfigType = {}; export class ModelGroup {}');
    assert.equal((await loadReader(root)).IndexType.marker, "local");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("merges additional animations without renumbering existing declarations and deduplicates IDs", () => {
  const base = { npcs: { boss: { id: 12, animations: { attack: 90, death: 91 } } } };
  const before = structuredClone(base);
  const merged = mergeAssets(base, { npcs: { bossAlias: { id: 12, animations: { special: 92, attack: 90 } } } });
  assert.deepEqual(Object.values(merged.npcs.boss.animations), [90, 91, 92]);
  assert.equal(merged.npcs.boss, merged.npcs.bossAlias);
  assert.equal(uniqueEntries(merged.npcs).length, 1);
  assert.equal(uniqueEntries(merged.npcs)[0][0], "boss");
  assert.deepEqual(base, before);
});

test("conflicts fail unless a named entry is explicitly replaced", () => {
  const base = { npcs: { boss: { id: 12, animations: { attack: 90 } } } };
  assert.throws(() => mergeAssets(base, { npcs: { boss: { id: 13 } } }), /Conflicting ID/);
  assert.throws(
    () => mergeAssets(base, { npcs: { alias: { id: 12, animations: { attack: 91 } } } }),
    /Conflicting animation/,
  );
  assert.equal(mergeAssets(base, {}, { npcs: { boss: { id: 13 } } }).npcs.boss.id, 13);
  assert.throws(() => mergeAssets(base, {}, { npcs: { unknown: { id: 13 } } }), /unknown/);
  assert.throws(
    () =>
      mergeAssets(
        { npcs: { boss: { id: 12, clickbox: { faceAlpha: 254 } } } },
        { npcs: { alias: { id: 12, clickbox: { faceAlpha: 255 } } } },
      ),
    /Conflicting clickbox/,
  );
  assert.throws(() => mergeAssets({}, { items: { fooBar: { id: 1 }, foobar: { id: 2 } } }), /Conflicting item alias/);
});

test("rejects malformed requirements early", () => {
  assert.throws(() => mergeAssets({}, { npc: {} }), /category/);
  assert.throws(() => mergeAssets({}, { npcs: { boss: { id: -1 } } }), /Invalid asset/);
  assert.throws(() => mergeAssets({}, { npcs: { boss: { id: 1, animation: 2 } } }), /Unknown option/);
  assert.throws(
    () => mergeAssets({}, { npcs: { boss: { id: 1, animations: { attack: "2" } } } }),
    /Invalid animations/,
  );
});

test("scene rules respect plane and replacement precedence, with client hooks", () => {
  const scenes = {
    1: {
      replacements: [{ x: 2, y: 3, z: 0, objectId: 8 }],
      removals: [{ xMin: 0, xMax: 10, yMin: 0, yMax: 10, z: 0 }],
    },
  };
  validateScenes(scenes);
  const location = { id: 2, position: { localX: 2, localY: 3, height: 0 } };
  assert.equal(applySceneTouchups(1, location, scenes).id, 8);
  assert.equal(applySceneTouchups(1, { ...location, position: { localX: 4, localY: 3, height: 0 } }, scenes), null);
  assert.equal(applySceneTouchups(1, { ...location, position: { localX: 4, localY: 3, height: 1 } }, scenes).id, 2);
  assert.equal(applySceneTouchups(1, location, scenes, { sceneLocation: () => null }), null);
  assert.throws(() => validateScenes({ 1: { removals: [{ xMin: 9, xMax: 1, yMin: 0, yMax: 1 }] } }), /Inverted/);
});

test("downloads cache and keys once, then reuses the pinned cache offline", async () => {
  const root = await mkdtemp(join(tmpdir(), "osrs-cache-test-"));
  const previousFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (url) => {
    calls++;
    if (url.endsWith("caches.json"))
      return new Response(
        JSON.stringify([
          { id: 7, game: "oldschool", scope: "runescape", disk_store_valid: true, builds: [{ major: 236 }] },
        ]),
      );
    if (url.endsWith("keys.json")) return new Response("[]");
    return new Response(
      zipSync({ "cache/main_file_cache.dat2": strToU8("data"), "cache/main_file_cache.idx255": strToU8("index") }),
    );
  };
  try {
    const first = await acquireCache(7, root);
    assert.equal(first.metadata.builds[0].major, 236);
    assert.equal(calls, 3);
    globalThis.fetch = () => {
      throw new Error("offline");
    };
    const second = await acquireCache(7, root);
    assert.equal(second.cachePath, first.cachePath);
    await assert.rejects(acquireCache(undefined, root), /pinned/);
    assert.throws(() => archiveTarget(root, "cache/../../outside"), /Unexpected/);
    assert.throws(() => archiveTarget(root, "cache/..\\outside"), /Unexpected/);
  } finally {
    globalThis.fetch = previousFetch;
    await rm(root, { recursive: true, force: true });
  }
});

test("writer is deterministic and keeps the last manifest if a build fails", async () => {
  const root = await mkdtemp(join(tmpdir(), "osrs-bundle-test-"));
  const decoded = {
    revision: 236,
    source: "openrs2:7",
    assets: [{ id: "npc-1", payload: { positions: [], indices: [] } }],
    references: { "npc:1": ["npc-1"] },
    soundEffects: [],
  };
  try {
    await writeFile(join(root, "unrelated.txt"), "keep");
    const manifest = await writeBundle(structuredClone(decoded), root);
    const bytes = await readFile(join(root, manifest.assets["npc-1"].file));
    // Four-byte magic + four-byte length, then gzip mtime at offset four.
    assert.equal(bytes.readUInt32LE(12), 0);
    assert.deepEqual(await writeBundle(structuredClone(decoded), root), manifest);
    await assert.rejects(writeBundle({ ...decoded, assets: [{ id: "bad", payload: {} }] }, root), /Missing geometry/);
    assert.deepEqual(JSON.parse(await readFile(join(root, "manifest.json"))), manifest);
    await access(join(root, manifest.assets["npc-1"].file));
    assert.equal(await readFile(join(root, "unrelated.txt"), "utf8"), "keep");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("loads a CommonJS client's TS config and resolves its own SDK, with paths relative to config", async () => {
  const root = await mkdtemp(join(tmpdir(), "osrs-config-test-"));
  try {
    await mkdir(join(root, "node_modules/osrs-sdk"), { recursive: true });
    await writeFile(join(root, "package.json"), '{"private":true}');
    await writeFile(join(root, "node_modules/osrs-sdk/package.json"), '{"name":"osrs-sdk","version":"0.1.8"}');
    await writeFile(
      join(root, "node_modules/osrs-sdk/asset-manifest.js"),
      "module.exports = { ASSET_REQUIREMENTS_VERSION: 1, CACHE_ASSETS: { playerAnimations: { idle: { id: 808 } }, items: { baseItem: { id: 1 } } }, SEMANTIC_POSE_MAP: { 0: { id: 808 } } };",
    );
    await writeFile(join(root, "assets.ts"), "export const assets = { npcs: { clientNpc: { id: 123 } } } as const;");
    await writeFile(
      join(root, "osrs-assets.config.ts"),
      'import { defineConfig } from "osrs-sdk-assets"; import { assets } from "./assets"; export default defineConfig({ cache: { openrs2: 7 }, assets });',
    );
    const config = await loadConfig({ cwd: "/", config: join(root, "osrs-assets.config.ts") });
    assert.equal(config.assets.items.baseItem.id, 1);
    assert.equal(config.assets.npcs.clientNpc.id, 123);
    assert.equal(config.outDir, join(root, "public/osrs-assets"));
    assert.equal((await loadConfig({ cwd: root, readerPath: "./custom-reader" })).readerPath, join(root, "custom-reader"));
    assert.deepEqual(config.semanticPoseMap, { 0: { id: 808 } });
    await assert.rejects(loadConfig({ cwd: root, outDir: root }), /dedicated directory/);
    await writeFile(
      join(root, "osrs-assets.config.ts"),
      "export default { cache: { openrs2: 7 }, overrides: { playerAnimations: { idle: { id: 900 } } } };",
    );
    await assert.rejects(loadConfig({ cwd: root }), /Cannot override SDK player pose/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("requires matching SDK and asset-tool versions", async () => {
  const root = await mkdtemp(join(tmpdir(), "osrs-version-test-"));
  try {
    await mkdir(join(root, "node_modules/osrs-sdk"), { recursive: true });
    await writeFile(join(root, "package.json"), '{"private":true}');
    await writeFile(join(root, "node_modules/osrs-sdk/package.json"), '{"name":"osrs-sdk","version":"0.1.7"}');
    await writeFile(
      join(root, "node_modules/osrs-sdk/asset-manifest.js"),
      "module.exports = { ASSET_REQUIREMENTS_VERSION: 1, CACHE_ASSETS: {}, SEMANTIC_POSE_MAP: {} };",
    );
    await writeFile(join(root, "osrs-assets.config.ts"), "export default { cache: { openrs2: 7 } };");
    await assert.rejects(loadConfig({ cwd: root }), /must have the same version/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
