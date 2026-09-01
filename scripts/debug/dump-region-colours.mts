#!/usr/bin/env node
/**
 * Writes the terrain-colour inputs for one cache region as JSON. This is a
 * diagnostic tool: it mirrors SceneRegionBuilder / rs-map-viewer data, not a
 * renderer-specific payload.
 *
 * Usage: tsx scripts/debug/dump-region-colours.mts <cache-path> <region-id> [output-path]
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { ConfigType, IndexType, RSCache } from "../../../osrscachereader/src/reader.js";

const [cachePath, regionIdArgument, outputArgument] = process.argv.slice(2);
if (!cachePath || !regionIdArgument) {
  throw new Error("Usage: dump-region-colours <cache-path> <region-id> [output-path]");
}

const regionId = Number(regionIdArgument);
if (!Number.isInteger(regionId)) throw new Error(`Invalid region ID: ${regionIdArgument}`);
const outputPath = resolve(outputArgument ?? `cache-render-bundle/scene-${regionId}-tile-colours.json`);
const cache = new RSCache(cachePath);
await cache.onload;

const map = await cache.getMap(regionId >> 8, regionId & 255);
if (!map) throw new Error(`Cache has no map data for region ${regionId}`);

const underlayDefinitions = new Map<number, any>();
const overlayDefinitions = new Map<number, any>();

const underlayDefinition = async (id: number) => {
  if (!underlayDefinitions.has(id)) {
    underlayDefinitions.set(id, await cache.getDef(IndexType.CONFIGS.id, ConfigType.UNDERLAY.id, id));
  }
  return underlayDefinitions.get(id);
};

const overlayDefinition = async (id: number) => {
  if (!overlayDefinitions.has(id)) {
    const file = await cache.getFile(IndexType.CONFIGS.id, ConfigType.OVERLAY.id, id);
    const content = file?.content ?? [];
    let primaryRgb: number | null = null;
    let secondaryRgb: number | null = null;
    for (let offset = 0; offset < content.length;) {
      const opcode = content[offset++];
      if (opcode === 0) break;
      if (opcode === 1 || opcode === 7) {
        const rgb = (content[offset] << 16) | (content[offset + 1] << 8) | content[offset + 2];
        if (opcode === 1) primaryRgb = rgb;
        else secondaryRgb = rgb;
        offset += 3;
      } else if (opcode === 2) {
        offset += 1;
      }
    }
    overlayDefinitions.set(id, { ...file?.def, primaryRgb, secondaryRgb });
  }
  return overlayDefinitions.get(id);
};

const packHsl = (hue: number, saturation: number, lightness: number) => {
  let adjustedSaturation = saturation;
  if (lightness > 179) adjustedSaturation /= 2;
  if (lightness > 192) adjustedSaturation /= 2;
  if (lightness > 217) adjustedSaturation /= 2;
  if (lightness > 243) adjustedSaturation /= 2;
  return ((adjustedSaturation / 32 | 0) << 7) + ((hue / 4 | 0) << 10) + (lightness / 2 | 0);
};

const unpackHsl = (hsl: number | null) => {
  if (hsl === null || hsl < 0 || hsl === 12345678) return null;
  return {
    hue: (hsl >> 10) & 63,
    saturation: (hsl >> 7) & 7,
    lightness: hsl & 127,
  };
};

// Matches OSRS-Environment-Exporter's ColorPalette(1.0): the colour baked
// into the GLB's untextured vertex-colour attribute. This deliberately stops
// before renderer-specific fog, tone mapping, or material lighting.
const hslToRgb = (hsl: number | null) => {
  const unpacked = unpackHsl(hsl);
  if (!unpacked) return null;
  const hue = unpacked.hue / 64 + 0.5 / 64;
  const saturation = unpacked.saturation / 8 + 0.5 / 8;
  const luminance = unpacked.lightness / 128;
  const chroma = (1 - Math.abs(2 * luminance - 1)) * saturation;
  const x = chroma * (1 - Math.abs((hue * 6) % 2 - 1));
  const base = luminance - chroma / 2;
  let r = base, g = base, b = base;
  switch (Math.floor(hue * 6)) {
    case 0: r += chroma; g += x; break;
    case 1: g += chroma; r += x; break;
    case 2: g += chroma; b += x; break;
    case 3: b += chroma; g += x; break;
    case 4: b += chroma; r += x; break;
    default: r += chroma; b += x; break;
  }
  const channel = (value: number) => Math.floor(Math.floor(value * 256) / 256 * 256);
  const red = channel(r), green = channel(g), blue = channel(b);
  const value = (red << 16) | (green << 8) | blue || 1;
  return { value, hex: `#${value.toString(16).padStart(6, "0")}`, red, green, blue };
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const adjustLightness = (hsl: number, brightness: number) => {
  if (hsl < 0) return hsl;
  return (hsl & 0xff80) | clamp(((hsl & 0x7f) * brightness) / 128, 2, 126);
};
const adjustUnderlayLightness = (hsl: number, brightness: number) => hsl === -1 ? 12345678 : adjustLightness(hsl, brightness);
const adjustOverlayLightness = (hsl: number, brightness: number) => {
  if (hsl === -2) return 12345678;
  if (hsl === -1) return clamp(brightness, 2, 126);
  return adjustLightness(hsl, brightness);
};

const tiles = map.tiles;
const heightAt = (plane: number, x: number, y: number) => map.getHeights()?.[plane]?.[clamp(x, 0, 63)]?.[clamp(y, 0, 63)] ?? 0;
const tileAt = (plane: number, x: number, y: number) => tiles[plane]?.[clamp(x, 0, 63)]?.[clamp(y, 0, 63)] ?? {};
const brightnessAt = (plane: number, x: number, y: number) => {
  const xHeightDiff = heightAt(plane, x + 1, y) - heightAt(plane, x - 1, y);
  const yHeightDiff = heightAt(plane, x, y + 1) - heightAt(plane, x, y - 1);
  const magnitude = Math.trunc(Math.hypot(xHeightDiff, yHeightDiff, 256));
  const normalX = Math.trunc((256 * xHeightDiff) / magnitude) / 256;
  const normalY = Math.trunc((256 * yHeightDiff) / magnitude) / 256;
  const normalZ = Math.trunc((256 * 256) / magnitude) / 256;
  const lightMagnitude = Math.trunc(Math.hypot(-50, -50, -10));
  const slope = Math.trunc((256 * (-50 * normalX - 50 * normalY - 10 * normalZ)) / Math.trunc((lightMagnitude * 768) / 256)) + 96;
  const settings = (tile: any) => tile.settings ?? 0;
  const occlusion = (settings(tileAt(plane, x - 1, y)) >> 2) + (settings(tileAt(plane, x, y - 1)) >> 2) + (settings(tileAt(plane, x + 1, y)) >> 3) + (settings(tileAt(plane, x, y + 1)) >> 3) + (settings(tileAt(plane, x, y)) >> 1);
  return { slope, occlusion, value: slope - occlusion };
};

const dumpTiles: any[] = [];
for (let plane = 0; plane < tiles.length; plane++) {
  for (let x = 0; x < 64; x++) {
    for (let y = 0; y < 64; y++) {
      const tile: any = tiles[plane]?.[x]?.[y] ?? {};
      const underlayId = tile.underlayId ?? 0;
      const overlayId = tile.overlayId ?? 0;
      const [underlay, overlay] = await Promise.all([
        underlayId > 0 ? underlayDefinition(underlayId - 1) : null,
        overlayId > 0 ? overlayDefinition(overlayId - 1) : null,
      ]);
      let hue = 0, saturation = 0, lightness = 0, multiplier = 0, count = 0;
      for (let sampleX = Math.max(0, x - 4); sampleX <= Math.min(63, x + 5); sampleX++) {
        for (let sampleY = Math.max(0, y - 4); sampleY <= Math.min(63, y + 5); sampleY++) {
          const sampleId = tiles[plane]?.[sampleX]?.[sampleY]?.underlayId ?? 0;
          if (!sampleId) continue;
          const definition = await underlayDefinition(sampleId - 1);
          if (!definition) continue;
          const hueMultiplier = Math.max(1, Math.floor(512 * (definition.saturation / 256) * Math.min(definition.lightness / 256, 1 - definition.lightness / 256)));
          hue += definition.hue;
          saturation += definition.saturation;
          lightness += definition.lightness;
          multiplier += hueMultiplier;
          count++;
        }
      }
      const blendedUnderlayHsl = count && multiplier ? packHsl(hue * 256 / multiplier, saturation / count, lightness / count) : null;
      const corners = [[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1]] as const;
      const cornerBrightness = corners.map(([cornerX, cornerY]) => brightnessAt(plane, cornerX, cornerY));
      const overlayHsl = overlay?.texture >= 0 ? -1 : overlay?.primaryRgb === 0xff00ff ? -2 : overlay?.color ?? null;
      const finalUnderlayHsl = blendedUnderlayHsl === null ? null : cornerBrightness.map(({ value }) => adjustUnderlayLightness(blendedUnderlayHsl, value));
      const finalOverlayHsl = overlayHsl === null ? null : cornerBrightness.map(({ value }) => adjustOverlayLightness(overlayHsl, value));
      dumpTiles.push({
        cache: { x, y, plane },
        // This is the current temporary Colosseum integration transform only.
        // It maps cache (33, 32) to the trainer tile the user called (27, 27).
        trainer: { x: x - 6, y: 59 - y, plane },
        raw: { underlayId, overlayId, overlayPath: tile.overlayPath ?? 0, overlayRotation: tile.overlayRotation ?? 0, settings: tile.settings ?? 0 },
        heights: corners.map(([cornerX, cornerY]) => heightAt(plane, cornerX, cornerY)),
        underlay: underlay ? { id: underlayId - 1, hue: underlay.hue, saturation: underlay.saturation, lightness: underlay.lightness } : null,
        overlay: overlay ? { id: overlayId - 1, color: overlay.color ?? null, texture: overlay.texture ?? null, primaryRgb: overlay.primaryRgb, secondaryRgb: overlay.secondaryRgb } : null,
        underlayBlend: { radius: 5, effectiveWindow: { startOffset: -4, endOffset: 5 }, sampleCount: count, hueSum: hue, saturationSum: saturation, lightnessSum: lightness, hueMultiplierSum: multiplier, packedHsl: blendedUnderlayHsl, unpackedHsl: unpackHsl(blendedUnderlayHsl) },
        cornerLighting: cornerBrightness,
        finalPackedHsl: {
          underlay: finalUnderlayHsl,
          overlay: finalOverlayHsl,
        },
        finalColours: {
          underlay: finalUnderlayHsl?.map((packedHsl) => ({ packedHsl, unpackedHsl: unpackHsl(packedHsl), rgb: hslToRgb(packedHsl) })) ?? null,
          overlay: finalOverlayHsl?.map((packedHsl) => ({ packedHsl, unpackedHsl: unpackHsl(packedHsl), rgb: hslToRgb(packedHsl) })) ?? null,
        },
      });
    }
  }
}

const document = {
  regionId,
  cacheToTrainer: {
    appliesToPlane: 0,
    x: "cacheX - 6",
    y: "59 - cacheY",
    note: "Temporary Colosseum integration offset; not a general cache coordinate system.",
  },
  colourPipeline: "Underlay neighbourhood blend -> packed HSL -> per-corner lightness adjustment. Overlay uses its own packed HSL or texture and is not included in underlay blending.",
  tiles: dumpTiles,
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(document, null, 2)}\n`);
console.log(`Wrote ${dumpTiles.length} tile colour records to ${outputPath}`);
