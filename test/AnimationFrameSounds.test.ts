import type { CacheRenderAnimation, CacheRenderFrameSound } from "../src/cache-render-format";
import { AnimationFrameSoundPlayer, chooseFrameSound, frameSoundsBetween } from "../src/sdk/rendering/AnimationFrameSounds";
import { cacheSound } from "../src/sdk/audio/CacheSoundEffects";
import { SoundCache } from "../src/sdk/utils/SoundCache";

const sound = (id: number, weight = 100): CacheRenderFrameSound => ({ id, weight, loops: 1, location: 15, retain: 12 });
const animation = (frameSounds: CacheRenderAnimation["frameSounds"]): CacheRenderAnimation => ({
  frames: [[], [], []],
  lengths: [2, 3, 5],
  frameSounds,
});

describe("cache animation frame sounds", () => {
  it("emits frame zero when an animation starts and later sounds as boundaries are crossed", () => {
    const value = animation({ 0: [sound(10)], 1: [sound(11)], 2: [sound(12)] });
    expect(frameSoundsBetween(value, null, 0.01, false).map(([entry]) => entry.id)).toEqual([10]);
    expect(frameSoundsBetween(value, 0.01, 0.09, false).map(([entry]) => entry.id)).toEqual([11]);
    expect(frameSoundsBetween(value, 0.09, 1, false).map(([entry]) => entry.id)).toEqual([12]);
  });

  it("emits frame zero again when a looping animation wraps", () => {
    const value = animation({ 0: [sound(20)], 2: [sound(22)] });
    expect(frameSoundsBetween(value, 0.19, 0.21, true).map(([entry]) => entry.id)).toEqual([20]);
  });

  it("does not replay more than one loop after a long suspended-frame gap", () => {
    const value = animation({ 0: [sound(30)], 1: [sound(31)] });
    expect(frameSoundsBetween(value, 0, 1, true).map(([entry]) => entry.id)).toEqual([31, 30]);
  });

  it("selects one variant using its relative cache weight", () => {
    const variants = [sound(40, 25), sound(41, 75)];
    expect(chooseFrameSound(variants, () => 0.2)?.id).toBe(40);
    expect(chooseFrameSound(variants, () => 0.3)?.id).toBe(41);
  });

  it("plays a cache effect once and routes located sounds through area audio", () => {
    const play = jest.spyOn(SoundCache, "play").mockImplementation(() => undefined);
    const player = new AnimationFrameSoundPlayer();
    const value = animation({ 0: [sound(50)] });

    player.advance(123, value, 0.01, false);
    player.advance(123, value, 0.02, false);

    expect(play).toHaveBeenCalledTimes(1);
    expect(play).toHaveBeenCalledWith(expect.objectContaining({ src: cacheSound(50), volume: 0.1, delayMs: 0 }), true);
    play.mockRestore();
  });

  it("applies a configured delay to every emitted frame sound", () => {
    const play = jest.spyOn(SoundCache, "play").mockImplementation(() => undefined);
    const player = new AnimationFrameSoundPlayer(100);

    player.advance(123, animation({ 0: [sound(60)] }), 0.01, false);

    expect(play).toHaveBeenCalledWith(expect.objectContaining({ src: cacheSound(60), delayMs: 100 }), true);
    play.mockRestore();
  });
});
