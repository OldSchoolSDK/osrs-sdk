import { Settings } from "../Settings";
import { isCacheSound, synthesizeCacheSound } from "../audio/CacheSoundEffects";

const LOADING_SOUND = null;

export class Sound {
  constructor(
    public src,
    public volume = 1,
  ) {}
}

export class SoundCache {
  static soundCache = {};

  static context = window.AudioContext ? new AudioContext() : null;
  static cachedSounds: { [src: string]: AudioBuffer } = {};

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
    if (SoundCache.cachedSounds[src] === LOADING_SOUND) {
      return null;
    }
    SoundCache.cachedSounds[src] = LOADING_SOUND;
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
  }

  static play({ src, volume }: Sound, isAreaSound = false) {
    if (!SoundCache.context) {
      return null;
    }
    if (this.cachedSounds[src] === undefined) {
      (async () => {
        const sound = await this.preload(src);
        // play after loading
        if (sound) {
          SoundCache.play({ src, volume });
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
    const source = SoundCache.context.createBufferSource();
    source.buffer = this.cachedSounds[src];
    let connect: AudioNode = SoundCache.context.destination;
    if (volume !== 1) {
      const gainNode = SoundCache.context.createGain();
      gainNode.gain.value = volume;
      source.connect(gainNode);
      gainNode.connect(SoundCache.context.destination);
      connect = gainNode;
    }
    source.connect(connect);
    source.start();
  }
}
