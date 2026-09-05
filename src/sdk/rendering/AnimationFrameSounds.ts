import type { CacheRenderAnimation, CacheRenderFrameSound } from "../../cache-render-format";
import type { Location } from "../Location";
import { cacheSound } from "../audio/CacheSoundEffects";
import { Sound, SoundCache } from "../utils/SoundCache";

const CACHE_ANIMATION_SOUND_VOLUME = 0.1;
const CLIENT_FRAMES_PER_SECOND = 50;

type TimedFrameSounds = { at: number; sounds: CacheRenderFrameSound[] };

function timedFrameSounds(animation: CacheRenderAnimation): TimedFrameSounds[] {
  const byFrame = animation.frameSounds ?? {};
  const starts: number[] = [];
  let elapsed = 0;
  for (let frame = 0; frame < animation.lengths.length; frame++) {
    starts[frame] = elapsed;
    elapsed += (animation.lengths[frame] ?? 0) / CLIENT_FRAMES_PER_SECOND;
  }
  return Object.entries(byFrame)
    .map(([frame, sounds]) => ({ at: starts[Number(frame)], sounds }))
    .filter(({ at, sounds }) => Number.isFinite(at) && sounds.length)
    .sort((a, b) => a.at - b.at);
}

/** Return sound groups whose frame boundary was crossed since the last draw. */
export function frameSoundsBetween(
  animation: CacheRenderAnimation,
  previousElapsed: number | null,
  elapsed: number,
  looping: boolean,
): CacheRenderFrameSound[][] {
  if (elapsed < 0) return [];
  const events = timedFrameSounds(animation);
  if (!events.length) return [];
  const total = animation.lengths.reduce((sum, length) => sum + length, 0) / CLIENT_FRAMES_PER_SECOND;
  if (total <= 0) return [];
  let from = previousElapsed == null || elapsed < previousElapsed ? -Number.EPSILON : previousElapsed;

  if (!looping) {
    const to = Math.min(elapsed, total);
    return events.filter(({ at }) => at > from && at <= to).map(({ sounds }) => sounds);
  }

  // A suspended browser can advance by many loops in one draw. Replaying that
  // whole backlog produces an audio burst, so retain at most the current loop.
  from = Math.max(from, elapsed - total);
  const crossed: Array<TimedFrameSounds & { absoluteTime: number }> = [];
  for (const event of events) {
    let cycle = Math.max(0, Math.floor((from - event.at) / total) + 1);
    for (let absoluteTime = cycle * total + event.at; absoluteTime <= elapsed; absoluteTime = ++cycle * total + event.at) {
      crossed.push({ ...event, absoluteTime });
    }
  }
  return crossed.sort((a, b) => a.absoluteTime - b.absoluteTime).map(({ sounds }) => sounds);
}

/** Pick one cache-authored variant. Weight values are relative to siblings. */
export function chooseFrameSound(
  sounds: CacheRenderFrameSound[],
  random: () => number = Math.random,
): CacheRenderFrameSound | undefined {
  if (!sounds.length) return undefined;
  const weights = sounds.map((sound) => Math.max(0, sound.weight));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (total <= 0) return sounds[Math.min(sounds.length - 1, Math.floor(random() * sounds.length))];
  let roll = random() * total;
  for (let index = 0; index < sounds.length; index++) {
    roll -= weights[index];
    if (roll < 0) return sounds[index];
  }
  return sounds[sounds.length - 1];
}

/** Pre-synthesise every unique effect owned by a set of cache animations. */
export async function preloadAnimationFrameSounds(animations: CacheRenderAnimation[]) {
  const ids = new Set<number>();
  for (const animation of animations) {
    for (const variants of Object.values(animation.frameSounds ?? {})) {
      for (const sound of variants) ids.add(sound.id);
    }
  }
  await Promise.all(Array.from(ids).map((id) => SoundCache.preload(cacheSound(id))));
}

export class AnimationFrameSoundPlayer {
  private animationId: number | null = null;
  private elapsed: number | null = null;

  constructor(private delayMs = 0) {}

  reset() {
    this.animationId = null;
    this.elapsed = null;
  }

  advance(animationId: number, animation: CacheRenderAnimation, elapsed: number, looping: boolean, sourceLocation?: Location) {
    const previous = this.animationId === animationId ? this.elapsed : null;
    for (const variants of frameSoundsBetween(animation, previous, elapsed, looping)) {
      const sound = chooseFrameSound(variants);
      if (sound) {
        const isAreaSound = (sound.location & 31) > 0;
        const area = isAreaSound && sourceLocation
          ? { location: sourceLocation, range: sound.location & 255, retain: sound.retain & 31 }
          : undefined;
        SoundCache.play(
          new Sound(cacheSound(sound.id), CACHE_ANIMATION_SOUND_VOLUME, this.delayMs, area),
          isAreaSound,
        );
      }
    }
    this.animationId = animationId;
    this.elapsed = elapsed;
  }
}
