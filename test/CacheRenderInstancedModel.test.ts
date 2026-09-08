import { cacheAnimationDuration, cacheAnimationFrameAt } from "../src/sdk/rendering/CacheRenderInstancedModel";

describe("cache-render instanced animation sampling", () => {
  const lengths = [2, 3, 1];

  it("uses client-cycle durations and advances at exact frame boundaries", () => {
    expect(cacheAnimationDuration(lengths)).toBe(0.12);
    expect(cacheAnimationFrameAt(lengths, 0, 3, true)).toBe(0);
    expect(cacheAnimationFrameAt(lengths, 0.039, 3, true)).toBe(0);
    expect(cacheAnimationFrameAt(lengths, 0.04, 3, true)).toBe(1);
    expect(cacheAnimationFrameAt(lengths, 0.1, 3, true)).toBe(2);
  });

  it("clamps one-shots and loops persistent instances", () => {
    expect(cacheAnimationFrameAt(lengths, 1, 3, true)).toBe(2);
    expect(cacheAnimationFrameAt(lengths, 0.12, 3, false)).toBe(0);
    expect(cacheAnimationFrameAt(lengths, 0.16, 3, false)).toBe(1);
  });

  it("does not select a frame before an instance delay has elapsed", () => {
    expect(cacheAnimationFrameAt(lengths, -0.001, 3, true)).toBe(-1);
  });
});
