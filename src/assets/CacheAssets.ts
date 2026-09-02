/**
 * Cache IDs required by the SDK sample and its runtime gameplay assets.
 *
 * Keep this registry free of cache-reader imports so browser code and the
 * Node-only extraction pipeline can share the same source of truth.
 */

type CacheItem = {
  id: number;
}

type Animations = {
  // Optional animations to pull (other than animations that make sense for the object,
  // e.g. standing/walking animations for npcs)
  animations?: { [key: string]: number };
}

type CacheModel = {
  faceAlphas?: number[];
}

type ClickboxFilter = {
  // Optional clickbox filter for the object. Geometry matching this will be split out into the npc's
  // clickbox. Example: Sol's massive white box.
  // TODO: there must be _something_ in the cache telling us this is the clickbox
  clickboxFilter?: (model: CacheModel, face: number) => boolean;
}

type CacheAssets = {
  npcs: { [key: string]: CacheItem & Animations & ClickboxFilter };
  regions: { [key: string]: CacheItem };
  models: { [key: string]: CacheItem & Animations };
  spotAnims: { [key: string]: CacheItem };
  playerAnimations: { [key: string]: { id: number } };
  items: { [key: string]: CacheItem };
  // CacheType.OBJECTS often used for replacing objects in scenes
  objects: { [key: string]: CacheItem };
  sounds: { [key: string]: CacheItem };
}

export const CACHE_ASSETS = {
  npcs: {
    verzik: {
      id: 8373,
    },
    solHeredit: {
      id: 12821,
      animations: {
        attack: 10883,
        attackAlt1: 10884,
        attackAlt2: 10885,
        attackAlt3: 10886,
        attackAlt4: 10887,
        attackAlt5: 10888,
        death: 10877,
      },
      clickboxFilter: (model, face) => (model.faceAlphas?.[face] ?? 0) === 254,
    },
  },
  regions: {
    inferno: { id: 9043 },
    colosseum: { id: 7216 },
  },
  models: {
    infernoPillar: { id: 33044 },
    solWallA: { id: 50963, animations: { idle: 7508 } },
    solWallB: { id: 50964, animations: { idle: 7508 } },
  },
  spotAnims: {
    scytheNorth: { id: 506 },
    scytheEast: { id: 1172 },
    scytheSouth: { id: 478 },
    scytheWest: { id: 1231 },
    solDust: { id: 2669 },
  },
  playerAnimations: {
    idle: { id: 808 },
    walk: { id: 819 },
    run: { id: 824 },
    rotate180: { id: 820 },
    strafeLeft: { id: 822 },
    strafeRight: { id: 821 },
    fireBow: { id: 426 },
    fireBlowpipe: { id: 5061 },
    throwChinchompa: { id: 7618 },
    scytheIdle: { id: 8057 },
    scytheSwing: { id: 8056 },
    swordSlash: { id: 390 },
    eat: { id: 829 },
    dying: { id: 836 },
    dragonClawsAttack: { id: 7514 },
  },
  items: {
    torvaFullHelm: { id: 26382 },
    amuletOfTorture: { id: 19553 },
    infernalCape: { id: 21295 },
    torvaPlatebody: { id: 26384 },
    torvaPlatelegs: { id: 26386 },
    primordialBoots: { id: 13239 },
    ferociousGloves: { id: 22981 },
    ultorRing: { id: 25485 },
    dragonArrows: { id: 11212 },
    scytheOfVitur: { id: 22325 },
    twistedBow: { id: 20997 },
    toxicBlowpipe: { id: 12926 },
    blackChinchompa: { id: 11959 },
    bowOfFaerdhinen: { id: 25865 },
    noxiousHalberd: { id: 29796 },
    bladeOfSaeldor: { id: 23995 },
    dragonClaws: { id: 13652 },
    avernicDefender: { id: 22322 },
  },
  objects: {
    infernoCornerA: { id: 30340 },
    infernoCornerB: { id: 30327 },
    infernoCornerC: { id: 30342 },
    infernoCornerD: { id: 30328 },
    infernoCornerE: { id: 30339 },
    infernoCornerF: { id: 30341 },
    infernoCornerG: { id: 30345 },
    infernoLavaRectangle: { id: 30291 },
  },
  sounds: {
    bloodBarrageImpact: { id: 102 },
    bloodBarrageCast: { id: 106 },
    iceBarrageImpact: { id: 168 },
    iceBarrageCast: { id: 171 },
    chinchompaImpact: { id: 360 },
    blowpipeSpecial: { id: 800 },
    bowOfFaerdhinenAttack: { id: 1352 },
    meleeAttack: { id: 2524 },
    blowpipeAttack: { id: 2696 },
    twistedBowAttack: { id: 2702 },
    chinchompaAttack: { id: 2706 },
    dragonClawsSpecialFirst: { id: 4138 },
    dragonClawsAttack: { id: 4139 },
    dragonClawsSpecialSecond: { id: 4140 },
    dragonClawsSpecialThird: { id: 4141 },
  },
} as const satisfies CacheAssets;

export const CACHE_SOUND_EFFECT_IDS = Object.values(CACHE_ASSETS.sounds).map(({ id }) => id);

/** Map the internal PlayerAnimationIndices values to cache animation entries. */
export const SEMANTIC_POSE_MAP = {
  0: CACHE_ASSETS.playerAnimations.idle,
  1: CACHE_ASSETS.playerAnimations.walk,
  2: CACHE_ASSETS.playerAnimations.run,
  3: CACHE_ASSETS.playerAnimations.rotate180,
  4: CACHE_ASSETS.playerAnimations.strafeLeft,
  5: CACHE_ASSETS.playerAnimations.strafeRight,
  6: CACHE_ASSETS.playerAnimations.fireBow,
  7: CACHE_ASSETS.playerAnimations.fireBlowpipe,
  8: CACHE_ASSETS.playerAnimations.throwChinchompa,
  9: CACHE_ASSETS.playerAnimations.scytheIdle,
  10: CACHE_ASSETS.playerAnimations.scytheSwing,
  11: CACHE_ASSETS.playerAnimations.swordSlash,
  12: CACHE_ASSETS.playerAnimations.eat,
  13: CACHE_ASSETS.playerAnimations.dying,
  14: CACHE_ASSETS.playerAnimations.dragonClawsAttack,
};
