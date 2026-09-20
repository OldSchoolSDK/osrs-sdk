import { sampleAnimation } from "../src/sdk/rendering/utils/animations";

describe("cache-render instanced animation sampling", () => {
  const lengths = [2, 3, 1];
  const animation = { lengths, frames: [[], [], []] };

  it("uses client-cycle durations and advances at exact frame boundaries", () => {
    expect(sampleAnimation(animation, 0, false).total).toBe(0.12);
    expect(sampleAnimation(animation, 0, false).frame).toBe(0);
    expect(sampleAnimation(animation, 0.039, false).frame).toBe(0);
    expect(sampleAnimation(animation, 0.04, false).frame).toBe(1);
    expect(sampleAnimation(animation, 0.1, false).frame).toBe(2);
  });

  it("clamps one-shots and loops persistent instances", () => {
    expect(sampleAnimation(animation, 1, false).frame).toBe(2);
    expect(sampleAnimation(animation, 0.12, true).frame).toBe(0);
    expect(sampleAnimation(animation, 0.16, true).frame).toBe(1);
  });

  it("does not select a frame before an instance delay has elapsed", () => {
    expect(sampleAnimation(animation, -0.001, false).frame).toBe(-1);
  });
});
