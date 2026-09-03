/* eslint-env node */
/* Adapter for Dezinater/osrscachereader. Kept Node-only: this file is never bundled. */
import { RSCache, IndexType, ConfigType, ModelGroup } from "../../../osrscachereader/src/reader.js";
import { CACHE_ASSETS, CACHE_SOUND_EFFECT_IDS, SEMANTIC_POSE_MAP } from "../../src/assets/CacheAssets";
import { applySceneTouchups } from "./scene-touchups.mts";
import { compileScene } from "./compile-scene.mts";
import { applyDefinitionOverrides } from "./definition-overrides";

const itemKey = (name) => name.toLowerCase().replace(/[^a-z0-9]/g, "");

// The SDK's unlit Three.js materials expect the cache palette's established
// 0.6 gamma adjustment. Tile brightness is applied to packed HSL beforehand;
// it is not this final RGB conversion.
function hslRgb(hsl, brightness = 0.6) {
  const hue = ((hsl >> 10) & 63) / 64 + 0.5 / 64, saturation = ((hsl >> 7) & 7) / 8 + 0.5 / 8, luminance = (hsl & 127) / 128;
  const chroma = (1 - Math.abs(2 * luminance - 1)) * saturation, x = chroma * (1 - Math.abs(((hue * 6) % 2) - 1)), lightness = luminance - chroma / 2;
  let r = lightness, g = lightness, b = lightness;
  switch (Math.floor(hue * 6)) { case 0: r += chroma; g += x; break; case 1: g += chroma; r += x; break; case 2: g += chroma; b += x; break; case 3: b += chroma; g += x; break; case 4: b += chroma; r += x; break; default: r += chroma; b += x; }
  const brighten = (v) => Math.floor(Math.pow(Math.floor(v * 256) / 256, brightness) * 256);
  return (brighten(r) << 16) | (brighten(g) << 8) | brighten(b) || 1;
}

function packHsl(hue, saturation, lightness) {
  let adjustedSaturation = saturation;
  if (lightness > 179) adjustedSaturation /= 2;
  if (lightness > 192) adjustedSaturation /= 2;
  if (lightness > 217) adjustedSaturation /= 2;
  if (lightness > 243) adjustedSaturation /= 2;
  return ((adjustedSaturation / 32 | 0) << 7) + ((hue / 4 | 0) << 10) + (lightness / 2 | 0);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function multiplyHslBrightness(hsl, brightness = 0x80) {
  const adjustedBrightness = ((hsl & 0x7f) * brightness) / 0x80;
  return (hsl & 0xff80) | clamp(adjustedBrightness, 2, 126);
}

function adjustUnderlayBrightness(hsl, brightness = 0x80) {
  if (hsl === -1) return 12345678;
  return multiplyHslBrightness(hsl, brightness);
}

function adjustOverlayBrightness(hsl, brightness = 0x80) {
  if (hsl === -2) return 12345678;
  if (hsl === -1) return clamp(brightness, 2, 126);
  return multiplyHslBrightness(hsl, brightness);
}

// RuneScape's scene tile mesh tables (the same tables used by the original
// Kotlin exporter). Values 1..16 identify corner, midpoint, and quarter-point
// vertices; path entries are [colour-layer, a, b, c] triangles.
const TILE_ROTATION_SHAPES = [
  [1, 3, 5, 7], [1, 3, 5, 7], [1, 3, 5, 7], [1, 3, 5, 7, 6],
  [1, 3, 5, 7, 6], [1, 3, 5, 7, 6], [1, 3, 5, 7, 6], [1, 3, 5, 7, 2, 6],
  [1, 3, 5, 7, 2, 8], [1, 3, 5, 7, 2, 8], [1, 3, 5, 7, 11, 12],
  [1, 3, 5, 7, 11, 12], [1, 3, 5, 7, 13, 14],
];
const TILE_PATH_SHAPES = [
  [0,1,2,3, 0,0,1,3], [1,1,2,3, 1,0,1,3], [0,1,2,3, 1,0,1,3],
  [0,0,1,2, 0,0,2,4, 1,0,4,3], [0,0,1,4, 0,0,4,3, 1,1,2,4],
  [0,0,4,3, 1,0,1,2, 1,0,2,4], [0,1,2,4, 1,0,1,4, 1,0,4,3],
  [0,4,1,2, 0,4,2,5, 1,0,4,5, 1,0,5,3],
  [0,4,1,2, 0,4,2,3, 0,4,3,5, 1,0,4,5],
  [0,0,4,5, 1,4,1,2, 1,4,2,3, 1,4,3,5],
  [0,0,1,5, 0,1,4,5, 0,1,2,4, 1,0,5,3, 1,5,4,3, 1,4,2,3],
  [1,0,1,5, 1,1,4,5, 1,1,2,4, 0,0,5,3, 0,5,4,3, 0,4,2,3],
  [1,0,5,4, 1,0,1,5, 0,0,4,3, 0,4,5,3, 0,5,2,3, 0,1,2,5],
];

async function terrainAsset(cache, regionId) {
  const regionX = regionId >> 8;
  const regionY = regionId & 255;
  const map = await cache.getMap(regionX, regionY);
  const tiles = map?.tiles?.[0] ?? [];
  const tileHeights = map?.getHeights?.()?.[0] ?? [];
  const baseHeight = tileHeights[0]?.[0] ?? 0;
  const positions = [], indices = [], colors = [], faceColors = [], alphas = [];
  const underlays = new Map();
  const overlays = new Map();
  // Port of SceneRegionBuilder.calcTileBrightness. The cache format supplies
  // height and settings, not a precomputed tile brightness value. Lighting is
  // evaluated at every tile corner, then each TileModel vertex inherits or
  // averages its adjacent corner colours.
  const localTile = (x, y) => tiles[clamp(x, 0, 63)]?.[clamp(y, 0, 63)] ?? {};
  const localHeight = (x, y) => tileHeights[clamp(x, 0, 63)]?.[clamp(y, 0, 63)] ?? baseHeight;
  const tileBrightness = (x, y) => {
    const xHeightDiff = localHeight(x + 1, y) - localHeight(x - 1, y);
    const yHeightDiff = localHeight(x, y + 1) - localHeight(x, y - 1);
    const magnitude = Math.trunc(Math.hypot(xHeightDiff, yHeightDiff, 256));
    const normalX = Math.trunc((256 * xHeightDiff) / magnitude) / 256;
    const normalY = Math.trunc((256 * yHeightDiff) / magnitude) / 256;
    const normalZ = Math.trunc((256 * 256) / magnitude) / 256;
    const lightMagnitude = Math.trunc(Math.hypot(-50, -50, -10));
    const slopeBrightness = Math.trunc((256 * (-50 * normalX - 50 * normalY - 10 * normalZ)) / Math.trunc((lightMagnitude * 768) / 256)) + 96;
    const setting = (tile) => tile.settings ?? 0;
    const occlusion = (setting(localTile(x - 1, y)) >> 2) + (setting(localTile(x, y - 1)) >> 2) + (setting(localTile(x + 1, y)) >> 3) + (setting(localTile(x, y + 1)) >> 3) + (setting(localTile(x, y)) >> 1);
    return slopeBrightness - occlusion;
  };
  const underlayDefinition = async (id) => {
    if (!underlays.has(id)) underlays.set(id, await cache.getDef(IndexType.CONFIGS.id, ConfigType.UNDERLAY.id, id));
    return underlays.get(id);
  };
  const overlayDefinition = async (id) => {
    if (!overlays.has(id)) {
      const file = await cache.getFile(IndexType.CONFIGS.id, ConfigType.OVERLAY.id, id);
      const content = file?.content ?? [];
      let rgb = null;
      for (let offset = 0; offset < content.length;) {
        const opcode = content[offset++];
        if (opcode === 0) break;
        if (opcode === 1) { rgb = (content[offset] << 16) | (content[offset + 1] << 8) | content[offset + 2]; offset += 3; }
        else if (opcode === 2) offset += 1;
        else if (opcode === 7) offset += 3;
      }
      overlays.set(id, { definition: file?.def, transparent: rgb === 0xff00ff });
    }
    return overlays.get(id);
  };
  // Match the scene builder's effective 10x10 underlay smoothing. Its
  // incremental add/remove loop covers [tile - 4, tile + 5], not a symmetric
  // 11x11 neighbourhood. The cache reader
  // exposes hue/saturation/lightness but not hueMultiplier, so reconstruct it
  // from the same HSL formula used by the loader.
  const blendedUnderlays = Array.from({ length: 64 }, () => Array(64).fill(null));
  for (let x = 0; x < 64; x++) for (let y = 0; y < 64; y++) {
    let hue = 0, saturation = 0, lightness = 0, multiplier = 0, count = 0;
    for (let sampleX = Math.max(0, x - 4); sampleX <= Math.min(63, x + 5); sampleX++) for (let sampleY = Math.max(0, y - 4); sampleY <= Math.min(63, y + 5); sampleY++) {
      const id = tiles[sampleX]?.[sampleY]?.underlayId;
      if (!id) continue;
      const definition = await underlayDefinition(id - 1);
      if (!definition) continue;
      const hueMultiplier = Math.max(1, Math.floor(512 * (definition.saturation / 256) * Math.min(definition.lightness / 256, 1 - definition.lightness / 256)));
      hue += definition.hue; saturation += definition.saturation; lightness += definition.lightness; multiplier += hueMultiplier; count++;
    }
    if (count && multiplier) blendedUnderlays[x][y] = packHsl(hue * 256 / multiplier, saturation / count, lightness / count);
  }
  const colorsForTile = async (tile) => {
    let underlay = null;
    let overlay = null;
    let transparentOverlay = false;
    if (tile?.overlayId > 0) {
      const info = await overlayDefinition(tile.overlayId - 1);
      transparentOverlay = info?.transparent === true;
      if (info?.definition?.color >= 0 && !transparentOverlay) overlay = info.definition.color;
    }
    return { underlay, overlay, transparentOverlay };
  };
  for (let x = 0; x < 64; x++) for (let y = 0; y < 64; y++) {
    const tile = tiles[x]?.[y];
    const tileColors = await colorsForTile(tile);
    // Smoothing changes an existing underlay's colour; it must not invent
    // terrain for cache tiles that have neither an underlay nor an overlay.
    tileColors.underlay = tile?.underlayId > 0 ? blendedUnderlays[x][y] : null;
    const hsl = tileColors.overlay ?? tileColors.underlay;
    // A 0/0 tile has neither terrain layer in the cache. It is intentional
    // void, not a black material, so leave the viewport's base floor visible.
    if (hsl === null) continue;
    const cornerBrightness = [tileBrightness(x, y), tileBrightness(x + 1, y), tileBrightness(x + 1, y + 1), tileBrightness(x, y + 1)];
    // rs-map-viewer's default `smoothTerrain: false` uses the blended
    // south-west underlay value for every corner of a tile.
    const underlayHsl = tileColors.underlay == null ? null : cornerBrightness.map((brightness) => adjustUnderlayBrightness(tileColors.underlay, brightness));
    const overlayHsl = tileColors.overlay == null ? null : cornerBrightness.map((brightness) => adjustOverlayBrightness(tileColors.overlay, brightness));
    // Map heights are absolute cache elevations, but individual scene objects
    // are currently positioned in region-local space. Normalize against the
    // region base until object terrain-height placement is compiled too.
    // CacheRenderInstancedModel already supplies the scene's floor origin;
    // retain only the terrain height relative to this region's base elevation.
    const heightAt = (cornerX, cornerY) => ((tileHeights[cornerX]?.[cornerY] ?? baseHeight) - baseHeight) / 128;
    const fullOverlay = tile?.overlayId > 0 && Math.floor(tile.overlayPath ?? 0) === 0;
    // Kotlin's overlayPath==1 TilePaint branch is overlay-only. A transparent
    // 0xFF00FF overlay therefore leaves no terrain face at all, even if the
    // cache tile also carries an underlay ID.
    if (fullOverlay && tileColors.transparentOverlay) continue;
    const shape = fullOverlay ? 1 : Math.max(1, Math.min(13, Math.floor(tile.overlayPath ?? 0) + 1));
    // Object locations are mirrored onto trainer Y. Mirror the tile geometry
    // too; reflection reverses overlay-path rotation.
    const rotation = (-(tile.overlayRotation ?? 0)) & 3;
    const rotationShape = TILE_ROTATION_SHAPES[shape - 1];
    const pathShape = TILE_PATH_SHAPES[shape - 1];
    const cornerHeight = [
      heightAt(x, y - 1), heightAt(x + 1, y - 1),
      heightAt(x + 1, y), heightAt(x, y),
    ];
    const vertexForShape = (value) => {
      let v = value;
      if ((v & 1) === 0 && v <= 8) v = ((v - rotation * 2 - 1) & 7) + 1;
      if (v >= 9 && v <= 12) v = ((v - 9 - rotation) & 3) + 9;
      if (v >= 13 && v <= 16) v = ((v - 13 - rotation) & 3) + 13;
      const points = {
        1: [0, 0, cornerHeight[0]], 2: [0.5, 0, (cornerHeight[1] + cornerHeight[0]) / 2],
        3: [1, 0, cornerHeight[1]], 4: [1, 0.5, (cornerHeight[1] + cornerHeight[2]) / 2],
        5: [1, 1, cornerHeight[2]], 6: [0.5, 1, (cornerHeight[2] + cornerHeight[3]) / 2],
        7: [0, 1, cornerHeight[3]], 8: [0, 0.5, (cornerHeight[3] + cornerHeight[0]) / 2],
        9: [0.5, 0.25, (cornerHeight[1] + cornerHeight[0]) / 2], 10: [0.75, 0.5, (cornerHeight[2] + cornerHeight[1]) / 2],
        11: [0.5, 0.75, (cornerHeight[2] + cornerHeight[3]) / 2], 12: [0.25, 0.5, (cornerHeight[3] + cornerHeight[0]) / 2],
        13: [0.25, 0.25, cornerHeight[0]], 14: [0.75, 0.25, cornerHeight[1]],
        15: [0.75, 0.75, cornerHeight[2]], 16: [0.25, 0.75, cornerHeight[3]],
      }[v];
      const colourCorners = {
        1: [0], 2: [0, 1], 3: [1], 4: [1, 2], 5: [2], 6: [2, 3], 7: [3], 8: [3, 0],
        9: [0, 1], 10: [1, 2], 11: [2, 3], 12: [3, 0], 13: [0], 14: [1], 15: [2], 16: [3],
      }[v];
      // CacheRenderInstancedModel applies its normal +90° actor rotation.
      return { point: [-(63 - y - points[1] + 0.5), points[2], x + points[0] - 0.5], colourCorners };
    };
    const vertices = rotationShape.map(vertexForShape);
    // Counter-clockwise triangles keep the terrain visible from above.
    for (let i = 0; i < pathShape.length; i += 4) {
      // 0xFF00FF is the cache's transparent terrain sentinel. The original
      // exporter omits these overlay faces instead of treating its converted
      // HSL value as white.
      if (pathShape[i] === 1 && tileColors.transparentOverlay) continue;
      const rotateIndex = (index) => index < 4 ? (index - rotation) & 3 : index;
      const useOverlay = fullOverlay || pathShape[i] === 1;
      const layerHsl = useOverlay ? overlayHsl : underlayHsl;
      const a = vertices[rotateIndex(pathShape[i + 1])], b = vertices[rotateIndex(pathShape[i + 2])], c = vertices[rotateIndex(pathShape[i + 3])];
      for (const vertex of [a, b, c]) {
        const index = positions.length / 3;
        const hsl = layerHsl == null ? null : Math.trunc(vertex.colourCorners.reduce((sum, corner) => sum + layerHsl[corner], 0) / vertex.colourCorners.length);
        // rs-map-viewer converts terrain HSL directly in its unlit shader.
        // The compiled terrain asset has the same unlit material, unlike
        // ordinary cache models which retain the runtime's 0.6 palette path.
        const color = hsl == null ? 0xffffff : hslRgb(hsl, 1);
        positions.push(...vertex.point); indices.push(index); colors.push(color); faceColors.push(color); alphas.push(0);
      }
    }
  }
  return { id: `scene-${regionId}-terrain`, payload: { positions, indices, colors, faceColors, alphas, color: 0xffffff, animations: {} } };
}

async function sceneAssets(cache, regionId, assets) {
  const regionX = regionId >> 8;
  const regionY = regionId & 255;
  const locations = (await cache.getLoc(regionX, regionY))?.locations ?? [];
  const map = await cache.getMap(regionX, regionY);
  const terrainHeights = map?.getHeights?.() ?? [];
  const terrainBaseHeight = terrainHeights[0]?.[0]?.[0] ?? 0;
  const objectTerrain = (location, width, length) => {
    const x = location.position.localX, y = location.position.localY, plane = location.position.height;
    const xLow = width + x <= 64 ? x + (width >> 1) : x;
    const xHigh = width + x <= 64 ? x + ((width + 1) >> 1) : x + 1;
    const yLow = length + y <= 64 ? y + (length >> 1) : y;
    const yHigh = length + y <= 64 ? y + ((length + 1) >> 1) : y + 1;
    const heightAt = (tileX, tileY) => terrainHeights[plane]?.[tileX]?.[tileY] ?? terrainBaseHeight;
    // Same four footprint samples and averaging convention as
    // SceneRegionBuilder before it creates the static object entity.
    const samples = [heightAt(xHigh, yHigh), heightAt(xLow, yHigh), heightAt(xHigh, yLow), heightAt(xLow, yLow)];
    const height = samples.reduce((sum, value) => sum + value, 0) / samples.length;
    return { height, elevation: height / 128 - terrainBaseHeight / 128, heightAt, varied: samples.some((value) => value !== height) };
  };
  const contourModel = (model, location, width, length, terrain, clipType) => {
    const xzMagnitude = Math.ceil(Math.sqrt(Math.max(...model.vertexPositionsX.map((value, index) => value * value + model.vertexPositionsZ[index] * model.vertexPositionsZ[index]))));
    const xOffset = location.position.localX * 128 + width * 64;
    const yOffset = location.position.localY * 128 + length * 64;
    const left = (xOffset - xzMagnitude) >> 7, right = (xOffset + xzMagnitude + 127) >> 7;
    const top = (yOffset - xzMagnitude) >> 7, bottom = (yOffset + xzMagnitude + 127) >> 7;
    const corners = [terrain.heightAt(left, top), terrain.heightAt(right, top), terrain.heightAt(left, bottom), terrain.heightAt(right, bottom)];
    if (corners.every((value) => value === terrain.height)) return false;
    const interpolateHeight = (worldX, worldY) => {
      const fractionX = worldX & 127, fractionY = worldY & 127;
      const tileX = worldX >> 7, tileY = worldY >> 7;
      const first = terrain.heightAt(tileX, tileY), second = terrain.heightAt(tileX + 1, tileY);
      const third = terrain.heightAt(tileX, tileY + 1), fourth = terrain.heightAt(tileX + 1, tileY + 1);
      const north = (first * (128 - fractionX) + second * fractionX) >> 7;
      const south = (third * (128 - fractionX) + fourth * fractionX) >> 7;
      return (north * (128 - fractionY) + south * fractionY) >> 7;
    };
    for (let vertex = 0; vertex < model.vertexCount; vertex++) {
      const originalY = model.vertexPositionsY[vertex];
      if (clipType === 0) {
        model.vertexPositionsY[vertex] = interpolateHeight(xOffset + model.vertexPositionsX[vertex], yOffset + model.vertexPositionsZ[vertex]) + originalY - terrain.height;
      } else {
        const scaledY = (-originalY << 16) / terrain.height;
        if (scaledY < clipType) {
          const sampled = interpolateHeight(xOffset + model.vertexPositionsX[vertex], yOffset + model.vertexPositionsZ[vertex]);
          model.vertexPositionsY[vertex] = ((clipType - scaledY) * (sampled - terrain.height)) / clipType + originalY;
        }
      }
    }
    return true;
  };
  const variants = new Map();
  const definitions = new Map();
  const placements = [];
  for (const sourceLocation of locations) {
    const location = applySceneTouchups(regionId, sourceLocation);
    if (!location) continue;
    // Location objects encode the definition, object layer/type, and its
    // rotation. That is the exact input ObjectDefinition.getModel needs to
    // apply definition-specific model selection, recolours, resizing, and
    // offsets before we serialise cache geometry.
    let definition = definitions.get(location.id);
    if (!definition) {
      definition = await cache.getDef(IndexType.CONFIGS.id, ConfigType.OBJECT.id, location.id);
      definitions.set(location.id, definition);
    }
    const width = (location.orientation & 1) ? (definition?.sizeY ?? 1) : (definition?.sizeX ?? 1);
    const height = (location.orientation & 1) ? (definition?.sizeX ?? 1) : (definition?.sizeY ?? 1);
    const terrain = objectTerrain(location, width, height);
    // Kotlin's SceneRegionBuilder changes the model orientation for wall
    // corners/diagonal decorations, and WALL_CORNER (type 2) emits a second
    // perpendicular model. Preserve the source location for placement while
    // compiling each model orientation as its own reusable payload.
    const firstModelOrientation = location.type === 2 || location.type === 6 || location.type === 8
      ? location.orientation + 4
      : location.type === 7
        ? ((location.orientation + 2) & 3) + 4
        : location.orientation;
    const modelOrientations = location.type === 2
      ? [firstModelOrientation, (location.orientation + 1) & 3]
      : [firstModelOrientation];
    for (const modelOrientation of modelOrientations) {
      const needsContour = definition?.contouredGround >= 0 && terrain.varied;
      const contourKey = needsContour ? `:${location.position.localX}:${location.position.localY}:${location.position.height}` : "";
      const key = `${location.id}:${location.type}:${modelOrientation}${contourKey}`;
      const assetId = `scene-${regionId}-object-${location.id}-${location.type}-${modelOrientation}${contourKey}`;
      variants.set(key, { assetId, location, definition, modelOrientation, terrain, width, height, needsContour });
      placements.push({ assetId, x: location.position.localX, y: location.position.localY, plane: terrain.elevation, width, height });
    }
  }
  for (const { assetId, location, definition, modelOrientation, terrain, width, height, needsContour } of variants.values()) {
    const model = await definition?.getModel(cache, location.type, modelOrientation);
    // Some map locations are sound/collision-only definitions. They remain in
    // the recipe for accounting, but have no model and should not become an
    // empty render payload.
    if (!model?.vertexCount) continue;
    // SceneRegionBuilder applies an additional 0x100 (45-degree) turn after
    // ObjectDefinition conversion for DIAGONAL_INTERACTABLE (type 11).
    // This is distinct from the model-orientation lookup above.
    if (location.type === 11) model.method1206(0x100);
    if (needsContour) contourModel(model, location, width, height, terrain, definition.contouredGround);
    const result = await attachTextures(cache, payload({ getMergedModel: () => model }));
    assets.push({ id: assetId, payload: result });
  }
  const available = new Set(assets.map((asset) => asset.id));
  return {
    regionId,
    // Cache region X is mirrored relative to the trainer's game-space
    // convention. Keep that scene-level correction in the compiled recipe.
    mirrorY: true,
    width: 64,
    height: 64,
    compiledAssets: {},
    placements: [{ assetId: `scene-${regionId}-terrain`, x: 0, y: 0, plane: 0 }, ...placements.filter((placement) => available.has(placement.assetId))],
  };
}

function payload(group, includeFace = (model, face) => true, definition) {
  const model = group.getMergedModel();
  if (!model || !model.vertexCount) throw new Error("Decoded model has no vertices");
  const positions = [], indices = [], colors = [], faceColors = [], uvs = [], textureIds = [], sourceVertices = [], animayaGroups = [], animayaScales = [], alphas = [], alphaGroups = (model.faceLabelsAlpha ?? []).map(() => []), vertexGroups = (model.vertexGroups ?? []).map(() => []);
  for (let face = 0; face < model.faceVertexIndices1.length; face++) {
    if (!includeFace(model, face)) continue;
    const { color: faceColor, texture: faceTexture } = applyDefinitionOverrides(
      model.faceColors?.[face] ?? 0,
      model.faceTextures?.[face] ?? -1,
      definition,
    );
    for (const source of [model.faceVertexIndices1[face], model.faceVertexIndices2[face], model.faceVertexIndices3[face]]) {
      const corner = positions.length / 3 % 3;
      const index = positions.length / 3; positions.push(model.vertexPositionsX[source] / 128, -model.vertexPositionsY[source] / 128, -model.vertexPositionsZ[source] / 128); indices.push(index);
      sourceVertices.push(source);
      animayaGroups.push(model.animayaGroups?.[source] ?? []);
      animayaScales.push(model.animayaScales?.[source] ?? []);
      colors.push(hslRgb(faceColor));
      faceColors.push(faceColor);
      alphas.push(model.faceAlphas?.[face] ?? 0);
      uvs.push(model.faceTextureUCoordinates?.[face]?.[corner] ?? 0, model.faceTextureVCoordinates?.[face]?.[corner] ?? 0);
      textureIds.push(faceTexture);
      for (let groupIndex = 0; groupIndex < vertexGroups.length; groupIndex++) if (model.vertexGroups[groupIndex]?.includes(source)) vertexGroups[groupIndex].push(index);
      for (let groupIndex = 0; groupIndex < alphaGroups.length; groupIndex++) if (model.faceLabelsAlpha[groupIndex]?.includes(face)) alphaGroups[groupIndex].push(index);
    }
  }
  return {
    positions, indices, vertexGroups, sourceVertices, animayaGroups, animayaScales, colors, faceColors, alphas, alphaGroups, uvs, textureIds,
    color: 0xffffff,
    animations: {},
  };
}

async function attachTextures(cache, result) {
  const ids = [...new Set((result.textureIds ?? []).filter((id) => id >= 0))];
  result.textures = {};
  for (const id of ids) {
    const definition = await cache.getDef(IndexType.TEXTURES.id, 0, id, { loadSprites: true });
    const sprite = definition?.sprites?.[0]?.def?.sprites?.[0];
    if (!sprite) continue;
    result.textures[id] = { width: sprite.width, height: sprite.height, pixels: sprite.pixels };
  }
  return result;
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
          baseId: frame.framemap.id,
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
      interleaveLeave: sequence.interleaveLeave ?? [],
    };
    if (sequence.animMayaID != null && sequence.animMayaID !== -1) {
      const index = group.getMergedModel().rev229 ? IndexType.KEYFRAMES : IndexType.FRAMES;
      const files = await cache.getAllFiles(index.id, sequence.animMayaID >> 16, { isAnimaya: true });
      const frameDef = files[0]?.def;
      if (!frameDef?.framemap?.animayaSkeleton) throw new Error(`Missing Animaya skeleton for sequence ${id}`);
      const matrices = [];
      for (let frame = 0; frame < sequence.animMayaEnd; frame++) {
        frameDef.framemap.animayaSkeleton.getAllBones().forEach((bone, index) => frameDef.method727(frame, bone, index, frameDef.field1257));
        matrices.push(frameDef.framemap.animayaSkeleton.getAllBones().map((bone) => Array.from(bone.method687(frameDef.field1257).matrixVals)));
      }
      result[id].mayaFrames = matrices;
      result[id].frames = [];
      result[id].lengths = new Array(matrices.length).fill(1);
    }
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

async function spotAnimAsset(cache, id, models) {
  const definition = await cache.getDef(IndexType.CONFIGS.id, ConfigType.SPOTANIM.id, id);
  if (!definition || definition.modelId == null) throw new Error(`Missing spotanim definition ${id}`);
  await modelAsset(cache, definition.modelId, models);
  // Keep the raw model for Spotanims: ModelGroup's geometry merge intentionally
  // omits face-label alpha groups, which are required by sequence type-5
  // fade transforms.
  const group = { getMergedModel: () => models.get(definition.modelId) };
  const result = await attachTextures(cache, payload(group, undefined, definition));
  result.animations = definition.animationId >= 0 ? await animations(cache, group, [definition.animationId]) : {};
  result.spotAnim = { id, animationId: definition.animationId, resizeX: definition.resizeX ?? 128, resizeY: definition.resizeY ?? 128, rotation: definition.rotation ?? 0 };
  return result;
}

export async function decodeAllAssets({ cachePath, revision }) {
  const cache = new RSCache(cachePath);
  await cache.onload;
  const models = new Map();
  const assets = [];
  for (const npcAsset of Object.values(CACHE_ASSETS.npcs)) {
    const npc = await cache.getNPC(npcAsset.id);
    if (!npc || !npc.models?.length) throw new Error(`Missing NPC definition ${npcAsset.id}`);
    const npcModelIds = npc.models;
    for (const id of npcModelIds) await modelAsset(cache, id, models);
    const npcGroup = new ModelGroup(npcModelIds.map((id) => models.get(id)), false);
    const { clickboxFilter } = npcAsset;
    const npcPayload = await attachTextures(cache, payload(npcGroup, clickboxFilter ? (model, face) => !clickboxFilter(model, face) : undefined, npc));
    if (clickboxFilter) npcPayload.geometryClickbox = payload(npcGroup, clickboxFilter);
    npcPayload.scale = (npc.heightScale ?? 128) / 128;
    // Base idle/walk sequences come from the cache NPC definition. Additional
    // sequences are owned by this registry entry and are extracted uniformly.
    const npcAnimations = {
      idle: npc.standingAnimation,
      walk: npc.walkingAnimation,
      ...(npcAsset.animations ?? {}),
    };
    const sequenceIds = Object.values(npcAnimations);
    npcPayload.animations = await animations(cache, npcGroup, sequenceIds);
    npcPayload.poseMap = Object.fromEntries(sequenceIds.map((id, index) => [index, id]));
    assets.push({ id: `npc-${npcAsset.id}`, payload: npcPayload });
  }

  for (const modelAssetDefinition of Object.values(CACHE_ASSETS.models)) {
    const modelId = modelAssetDefinition.id;
    await modelAsset(cache, modelId, models);
    const modelGroup = new ModelGroup([models.get(modelId)], false);
    const modelPayload = await attachTextures(cache, payload(modelGroup));
    const modelAnimations = Object.values(modelAssetDefinition.animations ?? {});
    modelPayload.animations = await animations(cache, modelGroup, modelAnimations);
    if (modelAnimations.length) modelPayload.poseMap = { 0: modelAnimations[0] };
    assets.push({ id: `model-${modelId}`, payload: modelPayload });
  }

  const spotAnimIds = Object.values(CACHE_ASSETS.spotAnims).map(({ id }) => id);
  const spotAnimAssets = {};
  for (const id of spotAnimIds) {
    const assetId = `spotanim-${id}`;
    assets.push({ id: assetId, payload: await spotAnimAsset(cache, id, models) });
    spotAnimAssets[String(id)] = assetId;
  }

  const itemDefs = await cache.getAllDefs(IndexType.CONFIGS.id, ConfigType.ITEM.id);
  const findItem = (name, id) => {
    const item = itemDefs.find((entry) => entry?.id === id);
    if (!item) throw new Error(`Missing player equipment definition: ${name} (${id})`);
    return item;
  };
  const playerPoseMap = Object.fromEntries(Object.entries(SEMANTIC_POSE_MAP).map(([index, animation]) => [index, animation.id]));
  const playerItemAssets = {};
  let sharedPlayerAnimations;
  for (const [itemName, itemDefinition] of Object.entries(CACHE_ASSETS.items)) {
    const item = findItem(itemName, itemDefinition.id);
    const itemIds = await itemModels(cache, item, models);
    const assetId = `player-item-${itemName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
    let playerPayload;
    if (!itemIds.length) {
      // Rings and some ammo have no character mesh but still participate in the
      // semantic loadout key; represent them as an empty composable asset.
      playerPayload = { positions: [0, 0, 0], indices: [], color: 0xffffff, animations: {}, poseMap: playerPoseMap };
    } else {
      const group = new ModelGroup(itemIds.map((id) => models.get(id)), false);
      playerPayload = await attachTextures(cache, payload(group, undefined, item));
      const itemAnimations = await animations(cache, group, Object.values(playerPoseMap));
      // Standard cache sequences are model-independent: their frame maps and
      // transform values can be applied after all equipment is composed. Keep
      // that metadata once in a shared asset instead of copying it into every
      // item payload. (Maya sequences have no raw frame map and are retained
      // in the item for backwards compatibility.)
      const shared = {};
      const itemSpecific = {};
      for (const [sequenceId, animation] of Object.entries(itemAnimations)) {
        if (animation.rawFrames?.length || animation.mayaFrames?.length) shared[sequenceId] = { lengths: animation.lengths, ...(animation.rawFrames?.length ? { rawFrames: animation.rawFrames, interleaveLeave: animation.interleaveLeave ?? [] } : { mayaFrames: animation.mayaFrames }), frames: [] };
        else itemSpecific[sequenceId] = animation;
      }
      sharedPlayerAnimations ??= { positions: [], animations: shared, poseMap: playerPoseMap };
      playerPayload.animations = itemSpecific;
      playerPayload.poseMap = Object.keys(itemSpecific).length ? playerPoseMap : undefined;
    }
    assets.push({ id: assetId, payload: playerPayload });
    // Item IDs are the stable contract used by SDK equipment definitions. Keep
    // the normalized name alias for older bundles/third-party callers.
    playerItemAssets[`item:${item.id}`] = assetId;
    playerItemAssets[itemKey(itemName)] = assetId;
  }
  let sharedAssets;
  if (sharedPlayerAnimations) {
    assets.push({ id: "player-animations", payload: sharedPlayerAnimations });
    sharedAssets = { playerAnimations: "player-animations" };
  }
  const sceneRegionIds = Object.values(CACHE_ASSETS.regions).map(({ id }) => id);
  for (const regionId of sceneRegionIds) assets.push(await terrainAsset(cache, regionId));
  const scenes = {};
  for (const regionId of sceneRegionIds) {
    const recipe = await sceneAssets(cache, regionId, assets);
    const compiled = compileScene(recipe, assets);
    assets.push(...compiled);
    recipe.compiledAssets = Object.fromEntries(compiled.map((asset) => [asset.id.endsWith("-terrain") ? "terrain" : asset.id.endsWith("-transparent") ? "transparent" : "opaque", asset.id]));
    delete recipe.placements;
    scenes[`region:${regionId}`] = recipe;
  }
  // The placement payloads were inputs to compilation only. Do not publish
  // them: runtime has no fallback path and shipping them would make the
  // manifest (and accidental client fetch surface) scale with scene objects.
  const sceneInputPrefix = new Set(sceneRegionIds.map((regionId) => `scene-${regionId}-`));
  for (let index = assets.length - 1; index >= 0; index--) {
    const id = assets[index].id;
    if ([...sceneInputPrefix].some((prefix) => id.startsWith(prefix)) && !id.includes("-compiled-")) assets.splice(index, 1);
  }
  const soundEffects = [];
  for (const id of CACHE_SOUND_EFFECT_IDS) {
    const file = await cache.getFile(IndexType.SOUNDEFFECTS, id, 0, { cacheResults: false });
    soundEffects.push({ id, bytes: Uint8Array.from(file.def.bytes) });
  }
  await cache.close?.();
  const rev = Number(revision || 0);
  return {
    revision: rev,
    source: process.env.OSRS_CACHE_SOURCE ?? `openrs2:${rev}`,
    assets,
    references: {
      ...Object.fromEntries(Object.values(CACHE_ASSETS.npcs).map(({ id }) => [`npc:${id}`, [`npc-${id}`]])),
      ...Object.fromEntries(Object.values(CACHE_ASSETS.models).map(({ id }) => [`model:${id}`, [`model-${id}`]])),
    },
    spotAnims: spotAnimAssets,
    playerItems: playerItemAssets,
    sharedAssets,
    scenes,
    soundEffects,
  };
}
