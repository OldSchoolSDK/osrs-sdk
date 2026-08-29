/* Adapter for Dezinater/osrscachereader. Kept Node-only: this file is never bundled. */
import { RSCache, IndexType, ConfigType, ModelGroup } from "../../osrscachereader/src/reader.js";

const NPC_ID = 8250; // Verzik Vitur

function payload(group) {
  const model = group.getMergedModel();
  if (!model || !model.vertexCount) throw new Error("Decoded model has no vertices");
  return {
    positions: model.vertexPositionsX.flatMap((x, i) => [x / 128, -model.vertexPositionsY[i] / 128, -model.vertexPositionsZ[i] / 128]),
    indices: model.faceVertexIndices1.flatMap((x, i) => [x, model.faceVertexIndices2[i], model.faceVertexIndices3[i]]),
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
    result[id] = {
      frames: animation.vertexData.map((frame) => frame.flatMap(([x, y, z]) => [x / 128, y / 128, z / 128])),
      lengths: animation.lengths,
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
  const loadoutNames = ["Scythe of Vitur", "Torva full helm", "Amulet of torture", "Infernal cape", "Torva platebody", "Torva platelegs", "Primordial boots", "Ferocious gloves", "Ultor ring", "Dragon arrow"];
  const playerIds = [];
  for (const name of loadoutNames) {
    const item = itemDefs.find((entry) => entry?.name?.toLowerCase() === name.toLowerCase());
    if (!item) {
      const candidates = itemDefs.filter((entry) => entry?.name?.toLowerCase().includes(name.toLowerCase().split(" ")[0])).slice(0, 5).map((entry) => entry.name);
      throw new Error(`Missing player equipment definition: ${name}${candidates.length ? ` (near matches: ${candidates.join(", ")})` : ""}`);
    }
    for (const key of ["maleModel0", "maleModel1", "maleModel2"]) if (item[key] >= 0) { await modelAsset(cache, item[key], models); playerIds.push(item[key]); }
  }
  const playerModels = playerIds.map((id) => models.get(id));
  const playerGroup = new ModelGroup(playerModels);
  const playerPayload = payload(playerGroup);
  const playerPoseMap = { 0: 808, 1: 819, 2: 824, 3: 820, 4: 822, 5: 821, 6: 426, 7: 5061, 8: 7618, 9: 8057, 10: 8056, 11: 390 };
  playerPayload.animations = await animations(cache, playerGroup, Object.values(playerPoseMap));
  playerPayload.poseMap = playerPoseMap;
  assets.push({ id: "player-sample", payload: playerPayload });
  await cache.close?.();
  const rev = Number(revision || 0);
  return {
    revision: rev,
    source: `openrs2:${rev}`,
    assets,
    references: { [`npc:${NPC_ID}`]: [`npc-${NPC_ID}`], [`player:${loadoutNames.slice().sort().join(",")}`]: ["player-sample"] },
  };
}
