/* Adapter for Dezinater/osrscachereader. Kept Node-only: this file is never bundled. */
import { RSCache, IndexType, ConfigType, ModelGroup } from "../../osrscachereader/src/reader.js";

const itemKey = (name) => name.toLowerCase().replace(/[^a-z0-9]/g, "");

const NPC_ID = 8250; // Verzik Vitur

function payload(group) {
  const model = group.getMergedModel();
  if (!model || !model.vertexCount) throw new Error("Decoded model has no vertices");
  return {
    positions: model.vertexPositionsX.flatMap((x, i) => [x / 128, -model.vertexPositionsY[i] / 128, -model.vertexPositionsZ[i] / 128]),
    indices: model.faceVertexIndices1.flatMap((x, i) => [x, model.faceVertexIndices2[i], model.faceVertexIndices3[i]]),
    vertexGroups: (model.vertexGroups ?? []).map((group) => group.slice()),
    color: model.faceColors?.[0] ?? 0xffffff,
    animations: {},
  };
}

async function animations(cache, group, sequenceIds) {
  const result = {};
  for (const id of [...new Set(sequenceIds.filter((value) => Number.isInteger(value) && value >= 0))]) {
    const sequence = await cache.getDef(IndexType.CONFIGS.id, ConfigType.SEQUENCE.id, id);
    if (!sequence) throw new Error(`Missing animation sequence definition ${id}`);
    const animation = await group.getMergedModel().loadAnimation(cache, id, false, true);
    const rawFrames = [];
    // Standard (frame-map) sequences can be evaluated against the final
    // composed model. This is important for equipment: animation pivots are
    // calculated from the merged vertex groups, not independently per item.
    if (sequence.animMayaID == null || sequence.animMayaID === -1) {
      for (const frameId of sequence.frameIDs ?? []) {
        const frame = await cache.getDef(IndexType.FRAMES.id, frameId >> 16, frameId & 65535);
        if (!frame) throw new Error(`Missing animation frame ${frameId} for sequence ${id}`);
        rawFrames.push({
          types: frame.framemap.types,
          maps: frame.framemap.frameMaps,
          indexFrameIds: frame.indexFrameIds,
          x: frame.translator_x,
          y: frame.translator_y,
          z: frame.translator_z,
        });
      }
    }
    result[id] = {
      frames: animation.vertexData.map((frame) => frame.flatMap(([x, y, z]) => [x / 128, y / 128, z / 128])),
      lengths: animation.lengths,
      ...(rawFrames.length ? { rawFrames } : {}),
    };
  }
  return result;
}

async function modelAsset(cache, id, models) {
  if (id < 0 || models.has(id)) return;
  const model = await cache.getDef(IndexType.MODELS.id, id);
  if (!model) throw new Error(`Missing model definition ${id}`);
  models.set(id, model);
}

async function itemModels(cache, item, models) {
  const ids = [];
  for (const key of ["maleModel0", "maleModel1", "maleModel2"]) {
    if (item[key] >= 0) { await modelAsset(cache, item[key], models); ids.push(item[key]); }
  }
  return ids;
}

export async function decodeSample({ cachePath, revision }) {
  const cache = new RSCache(cachePath);
  await cache.onload;
  const models = new Map();
  const assets = [];
  const npc = await cache.getNPC(NPC_ID);
  if (!npc || !npc.models?.length) throw new Error(`Missing NPC definition ${NPC_ID}`);
  for (const id of npc.models) await modelAsset(cache, id, models);
  const npcGroup = new ModelGroup([...models.values()]);
  const npcPayload = payload(npcGroup);
  npcPayload.animations = await animations(cache, npcGroup, [npc.standingAnimation, npc.walkingAnimation]);
  npcPayload.poseMap = { 0: npc.standingAnimation, 1: npc.walkingAnimation };
  assets.push({ id: `npc-${NPC_ID}`, payload: npcPayload });

  const itemDefs = await cache.getAllDefs(IndexType.CONFIGS.id, ConfigType.ITEM.id);
  // These names intentionally match ItemName values used by the SDK (Dragon arrow is singular).
  // SampleRegion keeps Dragon arrow equipped while switching weapons; the SDK's
  // ammo rules include it in the render reference even for melee variants.
  // These IDs mirror the explicit cacheItemId values on the SDK equipment
  // definitions. Names are labels only, never the lookup key.
  // TODO: parse the code to find all references to cache IDs and determine this dynamically
  const playerItems = [
    ["Torva full helm", 26382], ["Amulet of torture", 19553], ["Infernal cape", 21295],
    ["Torva platebody", 26384], ["Torva platelegs", 26386], ["Primordial boots", 13239],
    ["Ferocious gloves", 22981], ["Ultor ring", 25485], ["Dragon arrow", 11212],
    ["Scythe of Vitur", 22325], ["Twisted Bow", 20997], ["Toxic blowpipe", 12926],
    ["Black chinchompa", 11959], ["Bow of faerdhinen", 25865], ["Noxious halberd", 29796],
    ["Blade of saeldor", 23995], ["Avernic defender", 22322],
    // Remaining SDK equipment/weapons (IDs will be made explicit on the
    // definitions in a follow-up; names are used only for this inventory).
    ["Ahrim's robetop", null], ["Ahrim's robeskirt", null], ["Amulet of Fury", null],
    ["Ancestral Robe bottom", null], ["Ancestral Robe top", null], ["Ancient staff", null],
    ["Aranea boots", null], ["Armadyl Chainskirt", null], ["Armadyl Chestplate", null], ["Ava's accumulator", null],
    ["Avas Assembler", null], ["Barrows Gloves", null], ["Black d'hide body", null],
    ["Black d'hide chaps", null], ["Black d'hide vambraces", null], ["Crystal Body", null],
    ["Crystal Helm", null], ["Crystal Legs", null], ["Crystal Shield", null],
    ["Dagon'hai robe top", null], ["Devout Boots", null], ["Diamond bolts (e)", null],
    ["Dizana's Quiver", null], ["Dragon defender", null], ["Guthix robe top", null],
    ["Holy Blessing", null], ["Justiciar Chestguard", null], ["Justiciar Faceguard", null],
    ["Justiciar Legguards", null], ["Mage's Book", null], ["Masori body (f)", null],
    ["Masori chaps (f)", null], ["Masori mask (f)", null], ["Necklace of Anguish", null],
    ["Occult necklace", null], ["Pegasian Boots", null], ["Ranger boots", null], ["Berserker ring (i)", null],
    ["Ring of Endurance", null], ["Ring of Suffering (i)", null], ["Robin hood hat", null],
    ["Ruby bolts (e)", null], ["Rune Crossbow", null], ["Rune kiteshield", null],
    ["Saradomin coif", null], ["Saradomin d'hide body", null], ["Saradomin d'hide boots", null],
    ["Saradomin chaps", null], ["Slayer helmet (i)", null], ["Zaryte Vambraces", null],
    ["Abyssal tentacle", null], ["Kodai Wand", null],
  ];
  const findItem = (name, id) => {
    const item = itemDefs.find((entry) => id != null ? entry?.id === id : entry?.name && itemKey(entry.name) === itemKey(name));
    if (!item) throw new Error(`Missing player equipment definition: ${name} (${id})`);
    return item;
  };
  const playerPoseMap = { 0: 808, 1: 819, 2: 824, 3: 820, 4: 822, 5: 821, 6: 426, 7: 5061, 8: 7618, 9: 8057, 10: 8056, 11: 390 };
  const playerItemAssets = {};
  for (const [itemName, itemId] of playerItems) {
    const item = findItem(itemName, itemId);
    const itemIds = await itemModels(cache, item, models);
    const assetId = `player-item-${itemName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
    let playerPayload;
    if (!itemIds.length) {
      // Rings and some ammo have no character mesh but still participate in the
      // semantic loadout key; represent them as an empty composable asset.
      playerPayload = { positions: [0, 0, 0], indices: [], color: 0xffffff, animations: {}, poseMap: playerPoseMap };
    } else {
      const group = new ModelGroup(itemIds.map((id) => models.get(id)));
      playerPayload = payload(group);
      playerPayload.animations = await animations(cache, group, Object.values(playerPoseMap));
      playerPayload.poseMap = playerPoseMap;
    }
    assets.push({ id: assetId, payload: playerPayload });
    // Item IDs are the stable contract used by SDK equipment definitions. Keep
    // the normalized name alias for older bundles/third-party callers.
    playerItemAssets[`item:${item.id}`] = assetId;
    playerItemAssets[itemKey(itemName)] = assetId;
  }
  await cache.close?.();
  const rev = Number(revision || 0);
  return {
    revision: rev,
    source: `openrs2:${rev}`,
    assets,
    references: { [`npc:${NPC_ID}`]: [`npc-${NPC_ID}`] },
    playerItems: playerItemAssets,
  };
}
