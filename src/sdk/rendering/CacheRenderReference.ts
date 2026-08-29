/** A semantic reference to cache-derived render data. */
export type CacheRenderReference =
  | { kind: "npc"; definitionId: number; bundleId?: string }
  | { kind: "player"; loadout: string[]; poses?: Record<string, number>; bundleId?: string };

export const CacheRenderReferences = {
  npc(definitionId: number, bundleId?: string): CacheRenderReference {
    return { kind: "npc", definitionId, bundleId };
  },
  player(loadout: string[], poses?: Record<string, number>, bundleId?: string): CacheRenderReference {
    return { kind: "player", loadout: loadout.slice().sort(), poses, bundleId };
  },
};
