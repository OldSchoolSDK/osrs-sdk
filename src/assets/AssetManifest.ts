/** A cache definition selected for extraction. */
export type CacheAsset = {
  id: number;
};

/** A model-bearing definition with additional animation sequences to extract. */
export type AnimatedCacheAsset = CacheAsset & {
  animations?: Readonly<Record<string, number>>;
};

/** An NPC definition and its optional interaction geometry. */
export type NpcCacheAsset = AnimatedCacheAsset & {
  /** Faces with this alpha become clickbox geometry (for example Sol's box). */
  clickbox?: Readonly<{ faceAlpha: number }>;
};

export type AssetCategory =
  | "npcs"
  | "regions"
  | "models"
  | "spotAnims"
  | "playerAnimations"
  | "items"
  | "objects"
  | "sounds";
export type CacheAssets = {
  npcs?: Readonly<Record<string, NpcCacheAsset>>;
  regions?: Readonly<Record<string, CacheAsset>>;
  models?: Readonly<Record<string, AnimatedCacheAsset>>;
  spotAnims?: Readonly<Record<string, AnimatedCacheAsset>>;
  playerAnimations?: Readonly<Record<string, CacheAsset>>;
  items?: Readonly<Record<string, CacheAsset>>;
  objects?: Readonly<Record<string, CacheAsset>>;
  sounds?: Readonly<Record<string, CacheAsset>>;
};

/** Increment when the build tool's interpretation of SDK requirements changes. */
export const ASSET_REQUIREMENTS_VERSION = 1;
