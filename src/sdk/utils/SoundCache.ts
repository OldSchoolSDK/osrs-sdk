import { Settings } from "../Settings";
import { isCacheSound, synthesizeCacheSound } from "../audio/CacheSoundEffects";
import { CacheRender } from "../rendering/CacheRenderBundle";
import type { Location } from "../Location";

export type AreaSoundOptions = {
  /** Emitter position in SDK tile coordinates. */
  location: Location;
  /** Cache area range in tiles (the low byte of the sound location field). */
  range: number;
  /** Cache retain/minimum range (the low five bits of the retain field). */
  retain: number;
};

export class Sound {
  constructor(
    public src,
    public volume = 1,
    public delayMs = 0,
    public area?: AreaSoundOptions,
  ) {}
}

export class SoundCache {
  static soundCache = {};

  // Kept as a reference so movement is reflected automatically. Trainer wires
  // this to Trainer.player when the active viewport player is installed.
  private static audioListener: { location: Location } | null = null;

  static setAudioListener(listener: { location: Location } | null) {
    this.audioListener = listener;
  }

  static context = window.AudioContext ? new AudioContext() : null;
  static cachedSounds: { [src: string]: AudioBuffer } = {};
  static loadingSounds: { [src: string]: Promise<AudioBuffer> } = {};

  static getCachedSound(src: string): HTMLAudioElement {
    if (!src) {
      return null;
    }

    if (this.soundCache[src]) {
      return this.soundCache[src];
    }

    return (this.soundCache[src] = new Audio(src));
  }

  static async preload(src: string): Promise<AudioBuffer> {
    if (!SoundCache.context) {
      return null;
    }
    // Do not try to load cache sounds until the cache renderer is configured.
    if (isCacheSound(src) && !CacheRender.isConfigured()) {
      return null;
    }
    if (SoundCache.cachedSounds[src]) return SoundCache.cachedSounds[src];
    if (SoundCache.loadingSounds[src]) return SoundCache.loadingSounds[src];
    const pending = (async () => {
      let audioBuffer: AudioBuffer;
      if (isCacheSound(src)) {
        const raw = await synthesizeCacheSound(src);
        audioBuffer = SoundCache.context.createBuffer(1, raw.samples.length, raw.sampleRate);
        const channel = audioBuffer.getChannelData(0);
        for (let i = 0; i < raw.samples.length; i++) channel[i] = raw.samples[i] / 128;
      } else {
        const response = await window.fetch(src);
        const buffer = await response.arrayBuffer();
        audioBuffer = await SoundCache.context.decodeAudioData(buffer);
      }
      SoundCache.cachedSounds[src] = audioBuffer;
      return audioBuffer;
    })();
    SoundCache.loadingSounds[src] = pending;
    try {
      return await pending;
    } finally {
      if (SoundCache.loadingSounds[src] === pending) delete SoundCache.loadingSounds[src];
    }
  }

  static play(sound: Sound, isAreaSound = Boolean(sound.area)) {
    if (!SoundCache.context) {
      return null;
    }
    const { src, volume, delayMs } = sound;
    if (this.cachedSounds[src] === undefined) {
      (async () => {
        const loadedSound = await this.preload(src);
        // play after loading
        if (loadedSound) {
          SoundCache.play(new Sound(src, volume, delayMs, sound.area), isAreaSound);
        }
      })();
      return;
    }
    if (!this.cachedSounds[src]) {
      return;
    }
    if ((!isAreaSound && !Settings.playsAudio) || (isAreaSound && !Settings.playsAreaAudio)) {
      return;
    }
    if (delayMs > 0) {
      setTimeout(() => {
        SoundCache.play(new Sound(src, volume, 0, sound.area), isAreaSound);
      }, delayMs);
      return;
    }
    const effectiveVolume = isAreaSound ? this.areaVolume(sound) : volume;
    if (effectiveVolume <= 0) return;
    const source = SoundCache.context.createBufferSource();
    source.buffer = this.cachedSounds[src];
    let connect: AudioNode = SoundCache.context.destination;
    if (effectiveVolume !== 1) {
      const gainNode = SoundCache.context.createGain();
      gainNode.gain.value = effectiveVolume;
      source.connect(gainNode);
      gainNode.connect(SoundCache.context.destination);
      connect = gainNode;
    }
    source.connect(connect);
    source.start();
  }

  private static areaVolume(sound: Sound) {
    const area = sound.area;
    const listener = this.audioListener?.location;
    if (!area || !listener) return sound.volume;

    // This is the reference client's Manhattan tile-distance calculation in
    // its 128-units-per-tile representation. The source range is inclusive;
    // retain defines the full-volume inner radius.
    const range = Math.max(0, area.range) * 128;
    const retain = Math.max(0, (Math.max(0, area.retain) - 1) * 128);
    const distance = Math.max(
      (Math.abs(area.location.x - listener.x) + Math.abs(area.location.y - listener.y)) * 128 - 128,
      0,
    );
    if (distance >= range) return 0;
    const denominator = range - retain;
    const attenuation = denominator > 0
      ? Math.min(Math.max((range - distance) / denominator, 0), 1)
      : 1;
    return sound.volume * attenuation;
  }
}
