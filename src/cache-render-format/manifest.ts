/** Browser- and Node-neutral contract for a compiled cache-render bundle. */
export const CACHE_RENDER_BUNDLE_SCHEMA_VERSION = 1;

export type CacheRenderAsset = { file: string; sha256: string; bytes?: number };
export type CacheRenderScenePlacement = { assetId: string; x: number; y: number; plane: number; width?: number; height?: number };
export type CacheRenderScene = {
  regionId: number;
  /** Build-time source recipe. It is omitted from published compiled bundles. */
  placements?: CacheRenderScenePlacement[];
  mirrorY?: boolean; width?: number; height?: number;
  compiledAssets: { terrain?: string; opaque?: string; transparent?: string };
};
export type CacheRenderBundleManifest = {
  schemaVersion: number;
  bundleVersion: string;
  cache: { revision: number; source: string; contentHash: string };
  assets: Record<string, CacheRenderAsset>;
  references: Record<string, string[]>;
  scenes?: Record<string, CacheRenderScene>;
  playerItems?: Record<string, string>;
  spotAnims?: Record<string, string>;
  sharedAssets?: { playerAnimations?: string };
};

/** Structural validation shared by the asset writer and browser loader. */
export function isCacheRenderBundleManifest(value: any): value is CacheRenderBundleManifest {
  if (!value || value.schemaVersion !== CACHE_RENDER_BUNDLE_SCHEMA_VERSION || typeof value.bundleVersion !== "string" ||
      !value.cache || typeof value.cache.revision !== "number" || typeof value.cache.source !== "string" ||
      typeof value.cache.contentHash !== "string" || !value.assets || !value.references) return false;
  if (Object.values(value.assets).some((asset: any) => !asset || typeof asset.file !== "string" || !/^[a-f0-9]{64}$/i.test(asset.sha256))) return false;
  if (value.spotAnims !== undefined && (!value.spotAnims || typeof value.spotAnims !== "object" || Object.values(value.spotAnims).some((id: any) => typeof id !== "string"))) return false;
  if (value.sharedAssets !== undefined && (!value.sharedAssets || typeof value.sharedAssets !== "object" || (value.sharedAssets.playerAnimations !== undefined && typeof value.sharedAssets.playerAnimations !== "string"))) return false;
  return value.scenes === undefined || (typeof value.scenes === "object" && Object.values(value.scenes).every((scene: any) =>
    scene && Number.isInteger(scene.regionId) && (scene.placements === undefined || Array.isArray(scene.placements)) && scene.compiledAssets && typeof scene.compiledAssets === "object" &&
    (scene.compiledAssets.terrain === undefined || typeof scene.compiledAssets.terrain === "string") &&
    (scene.compiledAssets.opaque === undefined || typeof scene.compiledAssets.opaque === "string") &&
    (scene.compiledAssets.transparent === undefined || typeof scene.compiledAssets.transparent === "string") &&
    (scene.mirrorY === undefined || typeof scene.mirrorY === "boolean") &&
    (scene.width === undefined || (Number.isInteger(scene.width) && scene.width > 0)) &&
    (scene.height === undefined || (Number.isInteger(scene.height) && scene.height > 0)) &&
    (scene.placements ?? []).every((placement: any) => placement && typeof placement.assetId === "string" && Number.isFinite(placement.x) && Number.isFinite(placement.y) && Number.isFinite(placement.plane) &&
      (placement.width === undefined || (Number.isFinite(placement.width) && placement.width > 0)) &&
      (placement.height === undefined || (Number.isFinite(placement.height) && placement.height > 0)))));
}
