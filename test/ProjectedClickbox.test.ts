import {
  convexHull,
  isInFrontOfNearPlane,
  projectedHullContains,
} from "../src/sdk/rendering/ProjectedClickbox";

test("builds a projected hull and applies pointer tolerance", () => {
  const hull = convexHull([
    { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 },
    { x: 5, y: 5 }, { x: 0, y: 0 },
  ]);
  expect(hull).toHaveLength(4);
  expect(projectedHullContains(hull, { x: 5, y: 5 })).toBe(true);
  expect(projectedHullContains(hull, { x: 12, y: 5 })).toBe(false);
  expect(projectedHullContains(hull, { x: 12, y: 5 }, 2)).toBe(true);
});

test("rejects points on or behind the camera near plane before projection", () => {
  expect(isInFrontOfNearPlane(-1, 0.1)).toBe(true);
  expect(isInFrontOfNearPlane(-0.05, 0.1)).toBe(false);
  expect(isInFrontOfNearPlane(1, 0.1)).toBe(false);
});
