export class Sound {
  constructor(
    public src,
    public volume = 1,
    public delayMs = 0,
    public area?,
  ) {}
}

export class SoundCache {
  static setAudioListener() {
    return;
  }
  static preload() {
    return;
  }
  static play() {
    return;
  }
}
