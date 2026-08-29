/** A semantic reference to cache-derived render data. */
export type CacheRenderReference =
  | { kind: "npc"; definitionId: number; bundleId?: string }
  | { kind: "player"; loadout: Array<string | number>; poses?: Record<string, number>; bundleId?: string };

/** Stable semantic key for item references; display-name casing/punctuation is not significant. */
export function cacheRenderItemKey(item: string | number): string {
  return typeof item === "number" ? `item:${item}` : item.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export const CacheRenderReferences = {
  npc(definitionId: number, bundleId?: string): CacheRenderReference {
    return { kind: "npc", definitionId, bundleId };
  },
  player(loadout: Array<string | number>, poses?: Record<string, number>, bundleId?: string): CacheRenderReference {
    return { kind: "player", loadout: loadout.slice().sort(), poses, bundleId };
  },
};
