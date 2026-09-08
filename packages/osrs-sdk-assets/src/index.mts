import { createRequire } from "node:module";
import { readFile, writeFile, mkdir, open, unlink } from "node:fs/promises";
import { dirname, resolve, relative, isAbsolute } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { createHash, randomUUID } from "node:crypto";
import { build } from "esbuild";
import { mergeAssets } from "./manifest.mts";
import { validateScenes } from "./scene-touchups.mts";
import { acquireCache, validateCacheId } from "./download.mts";
import { decodeAllAssets } from "./adapter.mts";
import { writeBundle } from "./write-bundle.mts";

export { mergeAssets } from "./manifest.mts";
export const defineConfig = (config) => config;

export async function loadConfig({ config = "osrs-assets.config.ts", cwd = process.cwd(), ...options } = {}) {
  const configPath = resolve(cwd, config);
  const root = dirname(configPath);
  // Bundle local TS imports while resolving package imports from the client.
  // ESM output works in both CommonJS and ESM client projects on Node 20.
  const compiledPath = resolve(root, `.osrs-assets-config-${randomUUID()}.mjs`);
  let loaded;
  try {
    await build({
      entryPoints: [configPath],
      outfile: compiledPath,
      bundle: true,
      packages: "external",
      platform: "node",
      format: "esm",
      target: "node20",
      plugins: [
        {
          name: "invoked-asset-tool",
          setup(builder) {
            // npx may install the executable outside the client. Config helpers
            // must come from the invoked tool even without a local devDependency.
            builder.onResolve({ filter: /^osrs-sdk-assets$/ }, () => ({
              path: fileURLToPath(new URL("../dist/index.js", import.meta.url)),
              external: true,
            }));
          },
        },
      ],
    });
    loaded = await import(pathToFileURL(compiledPath).href);
  } finally {
    await unlink(compiledPath).catch(() => {});
  }
  const value = loaded.default?.default ?? loaded.default;
  if (!value || typeof value !== "object") throw new Error(`${configPath} must default-export an asset configuration`);
  for (const key of Object.keys(value))
    if (!["cache", "assets", "overrides", "outDir", "cacheDir", "readerPath", "scenes", "hooks"].includes(key))
      throw new Error(`Unknown asset configuration option ${key}`);
  const cacheId = options.cacheId ?? value.cache?.openrs2;
  validateCacheId(cacheId);
  validateScenes(value.scenes);
  const require = createRequire(resolve(root, "package.json"));
  let sdk, sdkPackage;
  try {
    sdk = require("osrs-sdk/asset-manifest");
    sdkPackage = require("osrs-sdk/package.json");
  } catch (error) {
    throw new Error("The client must install an osrs-sdk version exporting osrs-sdk/asset-manifest", { cause: error });
  }
  if (sdk.ASSET_REQUIREMENTS_VERSION !== 1)
    throw new Error(`Unsupported SDK asset requirements version ${sdk.ASSET_REQUIREMENTS_VERSION}`);
  const toolPackage = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  if (sdkPackage.version !== toolPackage.version)
    throw new Error(
      `osrs-sdk and osrs-sdk-assets must have the same version (found ${sdkPackage.version} and ${toolPackage.version})`,
    );
  const assets = mergeAssets(sdk.CACHE_ASSETS, value.assets, value.overrides);
  // SDK player poses form an ordered runtime contract. Client animations may
  // extend the extracted set without changing those SDK-owned slots.
  for (const [name, entry] of Object.entries(sdk.CACHE_ASSETS.playerAnimations)) {
    if (assets.playerAnimations[name]?.id !== entry.id)
      throw new Error(`Cannot override SDK player pose ${name} until playback uses animation IDs`);
  }
  for (const region of Object.keys(value.scenes ?? {})) {
    if (!Object.values(assets.regions).some((entry) => entry.id === Number(region)))
      throw new Error(`Scene rules target undeclared region ${region}`);
  }
  const outDir = resolve(root, options.outDir ?? value.outDir ?? "public/osrs-assets");
  const cacheDir = resolve(root, options.cacheDir ?? value.cacheDir ?? ".cache-render/openrs2");
  const inside = (parent, child) => {
    const path = relative(parent, child);
    return path === "" || (!path.startsWith("..") && !isAbsolute(path));
  };
  if (inside(outDir, root) || inside(outDir, cacheDir) || inside(cacheDir, outDir))
    throw new Error("Output must be a dedicated directory, separate from the project root and cache directory");
  const hooks = value.hooks ?? {};
  if (hooks.sceneLocation !== undefined && typeof hooks.sceneLocation !== "function")
    throw new Error("hooks.sceneLocation must be a function");
  for (const [id, filter] of Object.entries(hooks.clickboxFilter ?? {})) {
    if (!Object.values(assets.npcs).some((entry) => entry.id === Number(id)) || typeof filter !== "function")
      throw new Error(`Invalid clickbox hook for NPC ${id}`);
  }
  return {
    configPath,
    root,
    cacheId,
    outDir,
    cacheDir,
    readerPath: resolve(
      root,
      options.readerPath ?? process.env.OSRS_CACHE_READER_PATH ?? value.readerPath ?? "../osrscachereader",
    ),
    assets,
    semanticPoseMap: sdk.SEMANTIC_POSE_MAP,
    scenes: value.scenes ?? {},
    hooks,
    sdkVersion: sdkPackage.version,
  };
}

export async function buildAssets(options = {}) {
  const config = await loadConfig(options);
  await mkdir(config.outDir, { recursive: true });
  const lockPath = resolve(config.outDir, ".build.lock");
  let lock;
  try {
    lock = await open(lockPath, "wx");
  } catch (error) {
    throw new Error(
      `Asset output is locked: ${lockPath}. If a previous process crashed, remove this lock before retrying.`,
      { cause: error },
    );
  }
  try {
    const { cachePath, metadata } = await acquireCache(config.cacheId, config.cacheDir);
    console.log("Extracting merged SDK and client requirements");
    const decoded = await decodeAllAssets({
      ...config,
      cachePath,
      revision: metadata.builds[0].major,
      source: `openrs2:${config.cacheId}`,
    });
    const manifest = await writeBundle(decoded, config.outDir);
    const requirements = { assets: config.assets, scenes: config.scenes, hooks: config.hooks };
    const serialized = JSON.stringify(requirements, (_key, value) =>
      typeof value === "function" ? value.toString() : value,
    );
    await writeFile(
      resolve(config.outDir, "build-info.json"),
      JSON.stringify(
        {
          tool: { name: "osrs-sdk-assets", version: config.sdkVersion },
          sdkVersion: config.sdkVersion,
          cache: { openrs2: config.cacheId, revision: metadata.builds[0].major },
          requirementsHash: createHash("sha256").update(serialized).digest("hex"),
          requirements: JSON.parse(serialized),
          bundleVersion: manifest.bundleVersion,
        },
        null,
        2,
      ) + "\n",
    );
    console.log(`Host ${config.outDir}; manifest: manifest.json`);
    return manifest;
  } finally {
    await lock.close();
    await unlink(lockPath);
  }
}
