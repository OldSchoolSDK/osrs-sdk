import { RawSound, synthesizeSoundEffect } from "./SoundEffectSynth";
import { CacheRender } from "../rendering/CacheRenderBundle";

const CACHE_SOUND_PREFIX = "cache-sound:";

let definitionsPromise: Promise<Map<number, Uint8Array>>;

export function cacheSound(soundId: number) {
  return `${CACHE_SOUND_PREFIX}${soundId}`;
}

export function isCacheSound(source: string) {
  return source.startsWith(CACHE_SOUND_PREFIX);
}

export function parseSoundEffectPack(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 6 || bytes[0] !== 0x53 || bytes[1] !== 0x46 || bytes[2] !== 0x58 || bytes[3] !== 0x31) {
    throw new Error("Invalid sound-effect pack");
  }
  const count = view.getUint16(4);
  const definitions = new Map<number, Uint8Array>();
  let offset = 6;
  for (let i = 0; i < count; i++) {
    if (offset + 4 > bytes.length) throw new Error("Truncated sound-effect pack entry");
    const id = view.getUint16(offset);
    const length = view.getUint16(offset + 2);
    offset += 4;
    if (offset + length > bytes.length) throw new Error(`Truncated sound-effect ${id}`);
    definitions.set(id, bytes.slice(offset, offset + length));
    offset += length;
  }
  if (offset !== bytes.length) throw new Error("Unexpected trailing sound-effect pack data");
  return definitions;
}

async function loadDefinitions() {
  if (!definitionsPromise) {
    definitionsPromise = CacheRender.bundle()
      .then((bundle) => bundle.fetchSoundEffects())
      .then((buffer) => parseSoundEffectPack(new Uint8Array(buffer)));
  }
  return definitionsPromise;
}

function parseSource(source: string) {
  if (!isCacheSound(source)) throw new Error(`Not a cache sound source: ${source}`);
  const id = Number(source.slice(CACHE_SOUND_PREFIX.length));
  if (!Number.isInteger(id) || id < 0) throw new Error(`Invalid cache sound source: ${source}`);
  return id;
}

export async function synthesizeCacheSound(source: string): Promise<RawSound> {
  const definitions = await loadDefinitions();
  const id = parseSource(source);
  const definition = definitions.get(id);
  if (!definition) throw new Error(`Sound effect ${id} is not present in the runtime pack`);
  return synthesizeSoundEffect(definition);
}
