import * as THREE from "three";

export type CacheRecolorMap = Record<string, number>;

/** Convert a possibly signed cache byte to an unsigned alpha value. */
export function normalizeCacheAlpha(alpha: number) {
  return alpha & 255;
}

/** Convert cache transparency (0 = opaque) to Three.js opacity (1 = opaque). */
export function cacheAlphaToOpacity(alpha: number) {
  return 1 - Math.max(0, Math.min(255, alpha)) / 255;
}

/** Convert a packed cache display/sRGB colour to Three.js working-space RGB. */
export function cacheColorToRgb(value: number): [number, number, number] {
  const color = new THREE.Color(value);
  return [color.r, color.g, color.b];
}

/** Resolve a spot-animation recolour before colour-space conversion. */
export function resolveCacheColor(baseColor: number, faceColor?: number, recolor?: CacheRecolorMap) {
  return faceColor == null ? baseColor : recolor?.[String(faceColor)] ?? baseColor;
}

export function cacheColorsToRgb(colors: number[]) {
  const values: number[] = [];
  colors.forEach((color) => values.push(...cacheColorToRgb(color)));
  return values;
}

/** Build an RGBA attribute from normalized cache alpha values. */
export function cacheColorsToRgba(
  colors: number[],
  alphas: ArrayLike<number>,
  faceColors?: number[],
  recolor?: CacheRecolorMap,
) {
  const values: number[] = [];
  colors.forEach((baseColor, index) => {
    values.push(
      ...cacheColorToRgb(resolveCacheColor(baseColor, faceColors?.[index], recolor)),
      cacheAlphaToOpacity(alphas[index] ?? 0),
    );
  });
  return values;
}
