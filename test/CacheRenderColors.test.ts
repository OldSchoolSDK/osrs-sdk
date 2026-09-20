import {
  cacheAlphaToOpacity,
  normalizeCacheAlpha,
  resolveCacheColor,
} from "../src/sdk/rendering/utils/colors";

test("normalizes signed cache alpha bytes and clamps animated alpha", () => {
  expect(normalizeCacheAlpha(-1)).toBe(255);
  expect(cacheAlphaToOpacity(-10)).toBe(1);
  expect(cacheAlphaToOpacity(255)).toBe(0);
  expect(cacheAlphaToOpacity(300)).toBe(0);
});

test("resolves face recolours before colour-space conversion", () => {
  const recolor = { "12": 0xff0000 };
  expect(resolveCacheColor(0x0000ff, 12, recolor)).toBe(0xff0000);
  expect(resolveCacheColor(0x0000ff, 13, recolor)).toBe(0x0000ff);
});
