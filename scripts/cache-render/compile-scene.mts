import type { CacheRenderPayload } from "../../src/cache-render-format/index.ts";

type SourceAsset = { id: string; payload: CacheRenderPayload };
type Placement = { assetId: string; x: number; y: number; plane: number; width?: number; height?: number };
type Recipe = { regionId: number; placements: Placement[]; mirrorY?: boolean; height?: number };

type Output = Required<Pick<CacheRenderPayload, "positions" | "indices" | "colors" | "faceColors" | "alphas" | "uvs" | "textureIds">> & { textures: NonNullable<CacheRenderPayload["textures"]> };
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
  const opaque = output(), transparent = output();
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
      const target = transparentFace ? transparent : opaque;
      for (let corner = 0; corner < 3; corner++) appendVertex(source, indices[index + corner], target, transform);
    }
    Object.assign(opaque.textures, source.textures ?? {});
    Object.assign(transparent.textures, source.textures ?? {});
  }
  const payload = (result: Output): CacheRenderPayload => ({ version: 1, ...result, color: 0xffffff, animations: {} });
  const prefix = `scene-${recipe.regionId}-compiled`;
  return [
    ...(opaque.positions.length ? [{ id: `${prefix}-opaque`, payload: payload(opaque) }] : []),
    ...(transparent.positions.length ? [{ id: `${prefix}-transparent`, payload: payload(transparent) }] : []),
  ];
}
