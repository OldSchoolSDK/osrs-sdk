import type { CacheRenderPayload, CacheRenderStaticChunk } from "../../src/cache-render-format/index.ts";

type SourceAsset = { id: string; payload: CacheRenderPayload };
type Placement = { assetId: string; x: number; y: number; plane: number; width?: number; height?: number };
type Recipe = { regionId: number; placements: Placement[]; mirrorY?: boolean; height?: number };
// Arena scenes currently render as one ordinary mesh per material. Retain the
// chunk container format with a single region-sized entry so the compiler can
// reintroduce culling later without another payload migration.
const CHUNK_SIZE = 64;
const CHUNK_GRID = 64 / CHUNK_SIZE;

type Output = Required<Pick<CacheRenderStaticChunk, "positions" | "indices" | "colors" | "faceColors" | "alphas" | "uvs" | "textureIds">> & { textures: NonNullable<CacheRenderPayload["textures"]> };
const output = (): Output => ({ positions: [], indices: [], colors: [], faceColors: [], alphas: [], uvs: [], textureIds: [], textures: {} });

function appendVertex(source: CacheRenderPayload, sourceIndex: number, target: Output, transform: (x: number, y: number, z: number) => [number, number, number]) {
  const offset = sourceIndex * 3;
  const [x, y, z] = transform(source.positions[offset], source.positions[offset + 1], source.positions[offset + 2]);
  target.indices.push(target.positions.length / 3);
  target.positions.push(x, y, z);
  target.colors.push(source.colors?.[sourceIndex] ?? 0xffffff);
  target.faceColors.push(source.faceColors?.[sourceIndex] ?? 0);
  target.alphas.push(source.alphas?.[sourceIndex] ?? 0);
  target.uvs.push(source.uvs?.[sourceIndex * 2] ?? 0, source.uvs?.[sourceIndex * 2 + 1] ?? 0);
  target.textureIds.push(source.textureIds?.[sourceIndex] ?? -1);
}

/** Bake the exact placement transform currently applied by CacheRenderSceneModel.
 * Output coordinates are relative to the one scene-level instance transform. */
export function compileScene(recipe: Recipe, sourceAssets: SourceAsset[]) {
  const assets = new Map(sourceAssets.map((asset) => [asset.id, asset.payload]));
  const opaque = new Map<string, Output>(), transparent = new Map<string, Output>();
  const chunk = (map: Map<string, Output>, x: number, y: number) => {
    const key = `${Math.max(0, Math.min(CHUNK_GRID - 1, x))}:${Math.max(0, Math.min(CHUNK_GRID - 1, y))}`;
    let value = map.get(key); if (!value) { value = output(); map.set(key, value); }
    return value;
  };
  for (const rawPlacement of recipe.placements) {
    const placement = rawPlacement.assetId.endsWith("-terrain") || !recipe.mirrorY
      ? rawPlacement
      : { ...rawPlacement, y: (recipe.height ?? 64) - 1 - rawPlacement.y };
    const source = assets.get(placement.assetId);
    if (!source) continue;
    const terrain = placement.assetId.endsWith("-terrain");
    const transform = terrain
      // Terrain was authored for the generic instancer's +90-degree rotation.
      // Bake that rotation and retain the renderer's microscopic floor offset.
      ? (x: number, y: number, z: number): [number, number, number] => [z, y - 0.002, -x]
      // ObjectDefinition.getModel has already baked orientation. The values
      // below are the placement correction after removing the scene wrapper's
      // single half-tile instancer origin.
      : (x: number, y: number, z: number): [number, number, number] => [
        x + placement.x + ((placement.width ?? 1) - 1) / 2,
        y + placement.plane,
        z + placement.y - ((placement.height ?? 1) - 1) / 2,
      ];
    const indices = source.indices ?? Array.from({ length: source.positions.length / 3 }, (_, index) => index);
    for (let index = 0; index < indices.length; index += 3) {
      const transparentFace = [indices[index], indices[index + 1], indices[index + 2]].some((vertex) => (source.alphas?.[vertex] ?? 0) !== 0);
      // Objects belong to their placement tile; terrain is divided by triangle
      // centroid after its cache-to-scene transform has been applied.
      const chunkX = terrain ? Math.floor((transform(source.positions[indices[index] * 3], source.positions[indices[index] * 3 + 1], source.positions[indices[index] * 3 + 2])[0] + transform(source.positions[indices[index + 1] * 3], source.positions[indices[index + 1] * 3 + 1], source.positions[indices[index + 1] * 3 + 2])[0] + transform(source.positions[indices[index + 2] * 3], source.positions[indices[index + 2] * 3 + 1], source.positions[indices[index + 2] * 3 + 2])[0]) / (CHUNK_SIZE * 3)) : Math.floor(placement.x / CHUNK_SIZE);
      const chunkY = terrain ? Math.floor((transform(source.positions[indices[index] * 3], source.positions[indices[index] * 3 + 1], source.positions[indices[index] * 3 + 2])[2] + transform(source.positions[indices[index + 1] * 3], source.positions[indices[index + 1] * 3 + 1], source.positions[indices[index + 1] * 3 + 2])[2] + transform(source.positions[indices[index + 2] * 3], source.positions[indices[index + 2] * 3 + 1], source.positions[indices[index + 2] * 3 + 2])[2]) / (CHUNK_SIZE * 3)) : Math.floor(placement.y / CHUNK_SIZE);
      const target = chunk(transparentFace ? transparent : opaque, chunkX, chunkY);
      for (let corner = 0; corner < 3; corner++) appendVertex(source, indices[index + corner], target, transform);
    }
    for (const target of [...opaque.values(), ...transparent.values()]) Object.assign(target.textures, source.textures ?? {});
  }
  const payload = (results: Map<string, Output>): CacheRenderPayload => ({ version: 1, positions: [], chunks: Array.from(results.entries()).map(([key, result]) => { const [x, y] = key.split(":").map(Number); return { x, y, ...result }; }), color: 0xffffff, animations: {} });
  const prefix = `scene-${recipe.regionId}-compiled`;
  return [
    ...(opaque.size ? [{ id: `${prefix}-opaque`, payload: payload(opaque) }] : []),
    ...(transparent.size ? [{ id: `${prefix}-transparent`, payload: payload(transparent) }] : []),
  ];
}
