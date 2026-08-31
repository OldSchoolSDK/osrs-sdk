/** A semantic reference to cache-derived render data. */
export type CacheRenderReference =
  | { kind: "npc"; definitionId: number; spotAnims?: CacheRenderSpotAnim[]; bundleId?: string }
  | { kind: "model"; modelId: number; bundleId?: string }
  /** A precomposed cache payload, used by compiled static scene recipes. */
  | { kind: "asset"; assetId: string; bundleId?: string }
  | { kind: "spotAnim"; spotAnims: CacheRenderSpotAnim[]; bundleId?: string }
  | { kind: "player"; loadout: Array<string | number>; poses?: Record<string, number>; spotAnims?: CacheRenderSpotAnim[]; bundleId?: string };

/** Runtime placement/timing for a cache-derived effect. The cache stores the
 * effect model and sequence, but actor-specific height, offset, and delay are
 * supplied by gameplay code. */
export type CacheRenderSpotAnim = {
  id: number;
  /** Optional replacement channel for mutually exclusive effects. */
  channel?: string;
  /** Semantic player animation that activates this effect. */
  animation?: number;
  height?: number;
  /** Tile-plane world offset from the player (x/east, y/north). */
  offset?: { x: number; y: number };
  delay?: number;
  rotation?: number;
  /** Optional mapping from cache HSL face colours to Three.js RGB values. */
  recolor?: Record<string, number>;
};

/** Stable semantic key for item references; display-name casing/punctuation is not significant. */
export function cacheRenderItemKey(item: string | number): string {
  return typeof item === "number" ? `item:${item}` : item.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export const CacheRenderReferences = {
  npc(definitionId: number, spotAnimsOrBundleId?: CacheRenderSpotAnim[] | string, bundleId?: string): CacheRenderReference {
    const spotAnims = Array.isArray(spotAnimsOrBundleId) ? spotAnimsOrBundleId : undefined;
    const resolvedBundleId = typeof spotAnimsOrBundleId === "string" ? spotAnimsOrBundleId : bundleId;
    return { kind: "npc", definitionId, spotAnims, bundleId: resolvedBundleId };
  },
  model(modelId: number, bundleId?: string): CacheRenderReference {
    return { kind: "model", modelId, bundleId };
  },
  asset(assetId: string, bundleId?: string): CacheRenderReference {
    return { kind: "asset", assetId, bundleId };
  },
  spotAnim(spotAnims: CacheRenderSpotAnim[], bundleId?: string): CacheRenderReference {
    return { kind: "spotAnim", spotAnims: spotAnims.slice(), bundleId };
  },
  player(loadout: Array<string | number>, poses?: Record<string, number>, spotAnimsOrBundleId?: CacheRenderSpotAnim[] | string, bundleId?: string): CacheRenderReference {
    // Preserve equipment-slot order. The cache animation groups are merged in
    // this order; sorting IDs changes the correspondence between concatenated
    // vertices and animation frames.
    const spotAnims = Array.isArray(spotAnimsOrBundleId) ? spotAnimsOrBundleId : undefined;
    const resolvedBundleId = typeof spotAnimsOrBundleId === "string" ? spotAnimsOrBundleId : bundleId;
    return { kind: "player", loadout: loadout.slice(), poses, spotAnims, bundleId: resolvedBundleId };
  },
};
