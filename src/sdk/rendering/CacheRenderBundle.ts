import { CacheRenderReference, cacheRenderItemKey } from "./CacheRenderReference";

export const CACHE_RENDER_BUNDLE_SCHEMA_VERSION = 1;

export type CacheRenderAsset = { file: string; sha256: string; bytes?: number };
export type CacheRenderScenePlacement = { assetId: string; x: number; y: number; plane: number; width?: number; height?: number };
export type CacheRenderScene = { regionId: number; placements: CacheRenderScenePlacement[]; mirrorY?: boolean; width?: number; height?: number };
export type CacheRenderBundleManifest = {
  schemaVersion: number;
  bundleVersion: string;
  cache: { revision: number; source: string; contentHash: string };
  assets: Record<string, CacheRenderAsset>;
  references: Record<string, string[]>;
  /** Cache-derived static scene recipes. Geometry is stored in assets and reused by placement. */
  scenes?: Record<string, CacheRenderScene>;
  /** Maps semantic SDK item IDs (item:<id>) or legacy names to composable player payloads. */
  playerItems?: Record<string, string>;
  spotAnims?: Record<string, string>;
  /** Assets shared by multiple render payloads (currently player sequences). */
  sharedAssets?: { playerAnimations?: string };
};

export class CacheRenderBundleError extends Error {
  constructor(public readonly code: "manifest" | "integrity" | "missing-asset" | "network", message: string) {
    super(message);
  }
}

export function validateCacheRenderBundleManifest(value: any): CacheRenderBundleManifest {
  if (!value || value.schemaVersion !== CACHE_RENDER_BUNDLE_SCHEMA_VERSION ||
      typeof value.bundleVersion !== "string" || !value.cache || typeof value.cache.revision !== "number" ||
      typeof value.cache.source !== "string" || typeof value.cache.contentHash !== "string" ||
      !value.assets || !value.references) {
    throw new CacheRenderBundleError("manifest", "Invalid cache render bundle manifest or unsupported schema version");
  }
  Object.keys(value.assets).forEach((key) => {
    const asset = value.assets[key];
    if (!asset || typeof asset.file !== "string" || !/^[a-f0-9]{64}$/i.test(asset.sha256)) {
      throw new CacheRenderBundleError("manifest", `Invalid asset entry: ${key}`);
    }
  });
  if (value.spotAnims !== undefined && (!value.spotAnims || typeof value.spotAnims !== "object" ||
      Object.values(value.spotAnims).some((id: any) => typeof id !== "string"))) {
    throw new CacheRenderBundleError("manifest", "Invalid spot animation asset mapping");
  }
  if (value.scenes !== undefined && (!value.scenes || typeof value.scenes !== "object" ||
      Object.values(value.scenes).some((scene: any) => !scene || !Number.isInteger(scene.regionId) || !Array.isArray(scene.placements) ||
        (scene.mirrorY !== undefined && typeof scene.mirrorY !== "boolean") ||
        (scene.width !== undefined && (!Number.isInteger(scene.width) || scene.width <= 0)) ||
        (scene.height !== undefined && (!Number.isInteger(scene.height) || scene.height <= 0)) ||
        scene.placements.some((placement: any) => !placement || typeof placement.assetId !== "string" ||
          !Number.isFinite(placement.x) || !Number.isFinite(placement.y) || !Number.isFinite(placement.plane) ||
          (placement.width !== undefined && (!Number.isFinite(placement.width) || placement.width <= 0)) ||
          (placement.height !== undefined && (!Number.isFinite(placement.height) || placement.height <= 0)))))) {
    throw new CacheRenderBundleError("manifest", "Invalid scene recipe");
  }
  if (value.sharedAssets !== undefined && (!value.sharedAssets || typeof value.sharedAssets !== "object" ||
      (value.sharedAssets.playerAnimations !== undefined && typeof value.sharedAssets.playerAnimations !== "string"))) {
    throw new CacheRenderBundleError("manifest", "Invalid shared asset mapping");
  }
  return value as CacheRenderBundleManifest;
}

  function referenceKey(reference: CacheRenderReference): string {
  if (reference.kind === "npc") return `npc:${reference.definitionId}`;
  if (reference.kind === "model") return `model:${reference.modelId}`;
  if (reference.kind === "spotAnim") return "spotAnim";
  if (reference.kind === "player") return `player:${reference.loadout.map(cacheRenderItemKey).join(",")}`;
  return "asset";
}

async function sha256(bytes: ArrayBuffer): Promise<string> {
  if (!globalThis.crypto || !globalThis.crypto.subtle) {
    throw new CacheRenderBundleError("integrity", "Web Crypto is required to verify cache render assets");
  }
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.prototype.map.call(new Uint8Array(digest), (v: number) => v.toString(16).padStart(2, "0")).join("");
}

export class CacheRenderBundle {
  private constructor(public readonly baseUrl: string, public readonly manifest: CacheRenderBundleManifest) {}

  static async load(manifestUrl: string): Promise<CacheRenderBundle> {
    let response: Response;
    try { response = await fetch(manifestUrl); } catch (error) {
      throw new CacheRenderBundleError("network", `Unable to load cache render manifest: ${error.message}`);
    }
    if (!response.ok) throw new CacheRenderBundleError("network", `Unable to load cache render manifest (${response.status})`);
    let manifest: CacheRenderBundleManifest;
    try { manifest = validateCacheRenderBundleManifest(await response.json()); } catch (error) {
      if (error instanceof CacheRenderBundleError) throw error;
      throw new CacheRenderBundleError("manifest", "Cache render manifest is not JSON");
    }
    // `fetch` accepts relative URLs, but URL resolution for the payload files
    // requires an absolute base. Resolve site-relative manifests against the
    // page that requested them (while preserving absolute/CDN URLs).
    const manifestAbsoluteUrl = new URL(manifestUrl, window.location.href);
    return new CacheRenderBundle(new URL(".", manifestAbsoluteUrl).toString(), manifest);
  }

  assetIds(reference: CacheRenderReference): string[] {
    if (reference.kind === "spotAnim") return [];
    if (reference.kind === "asset") return [reference.assetId];
    if (reference.kind === "player" && this.manifest.playerItems) {
      const itemIds = reference.loadout.map((item) => this.manifest.playerItems[cacheRenderItemKey(item)] || this.manifest.playerItems[item]);
      const missing = reference.loadout.filter((item, index) => !itemIds[index]);
      if (!missing.length) return itemIds.filter((id, index) => itemIds.indexOf(id) === index);
      throw new CacheRenderBundleError("missing-asset", `Bundle has no player item data for ${missing.join(", ")}`);
    }
    const ids = this.manifest.references[referenceKey(reference)];
    if (ids) return ids;
    throw new CacheRenderBundleError("missing-asset", `Bundle has no render data for ${referenceKey(reference)}`);
  }

  spotAnimIds(reference: CacheRenderReference): string[] {
    const spotAnims = reference.kind === "model" || reference.kind === "asset" ? undefined : reference.spotAnims;
    return (spotAnims ?? []).map((spotAnim) => this.manifest.spotAnims?.[String(spotAnim.id)]).filter((id): id is string => Boolean(id));
  }

  sharedAssetIds(reference: CacheRenderReference): string[] {
    if (reference.kind !== "player") return [];
    const id = this.manifest.sharedAssets?.playerAnimations;
    return id ? [id] : [];
  }

  allSpotAnimIds(): string[] {
    const ids: string[] = [];
    Object.keys(this.manifest.spotAnims ?? {}).forEach((key) => { const id = this.manifest.spotAnims?.[key]; if (id && ids.indexOf(id) < 0) ids.push(id); });
    return ids;
  }

  async fetchAsset(id: string): Promise<ArrayBuffer> {
    const asset = this.manifest.assets[id];
    if (!asset) throw new CacheRenderBundleError("missing-asset", `Bundle is missing asset ${id}`);
    let response: Response;
    try { response = await fetch(new URL(asset.file, this.baseUrl).toString()); } catch (error) {
      throw new CacheRenderBundleError("network", `Unable to load cache render asset ${id}: ${error.message}`);
    }
    if (!response.ok) throw new CacheRenderBundleError("missing-asset", `Unable to load cache render asset ${id} (${response.status})`);
    const bytes = await response.arrayBuffer();
    if (asset.bytes !== undefined && bytes.byteLength !== asset.bytes) throw new CacheRenderBundleError("integrity", `Invalid length for cache render asset ${id}`);
    if ((await sha256(bytes)).toLowerCase() !== asset.sha256.toLowerCase()) throw new CacheRenderBundleError("integrity", `Integrity check failed for cache render asset ${id}`);
    return bytes;
  }
}

/** Runtime configuration. Set `manifestUrl` to a locally extracted bundle to override the hosted default. */
export class CacheRender {
  private static manifestUrl: string | null = null;
  private static bundlePromise: Promise<CacheRenderBundle> | null = null;
  static configure(manifestUrl: string | null) { this.manifestUrl = manifestUrl; this.bundlePromise = null; }
  static isConfigured() { return this.manifestUrl !== null; }
  static bundle(): Promise<CacheRenderBundle> {
    if (!this.manifestUrl) return Promise.reject(new CacheRenderBundleError("network", "No cache render bundle is configured"));
    return this.bundlePromise ?? (this.bundlePromise = CacheRenderBundle.load(this.manifestUrl));
  }
}
