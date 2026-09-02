export const SOUND_EFFECT_SAMPLE_RATE = 22050;

export interface RawSound {
  sampleRate: number;
  samples: Int8Array;
  loopStart: number;
  loopEnd: number;
}

class SoundInput {
  private readonly view: DataView;
  offset = 0;

  constructor(bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  private require(length: number) {
    if (this.offset + length > this.view.byteLength) {
      throw new RangeError(`Truncated sound effect at byte ${this.offset}`);
    }
  }

  unsignedByte() {
    this.require(1);
    return this.view.getUint8(this.offset++);
  }

  unsignedShort() {
    this.require(2);
    const value = this.view.getUint16(this.offset);
    this.offset += 2;
    return value;
  }

  int() {
    this.require(4);
    const value = this.view.getInt32(this.offset);
    this.offset += 4;
    return value;
  }

  unsignedShortSmart() {
    this.require(1);
    return this.view.getUint8(this.offset) < 128 ? this.unsignedByte() : this.unsignedShort() - 32768;
  }

  shortSmart() {
    this.require(1);
    return this.view.getUint8(this.offset) < 128 ? this.unsignedByte() - 64 : this.unsignedShort() - 49152;
  }
}

class SoundEnvelope {
  form = 0;
  start = 0;
  end = 0;
  durations = [0, 65535];
  phases = [0, 65535];
  private ticks = 0;
  private phaseIndex = 0;
  private step = 0;
  private amplitude = 0;
  private max = 0;

  decode(input: SoundInput) {
    this.form = input.unsignedByte();
    this.start = input.int();
    this.end = input.int();
    this.decodeSegments(input);
  }

  decodeSegments(input: SoundInput) {
    const count = input.unsignedByte();
    this.durations = new Array(count);
    this.phases = new Array(count);
    for (let i = 0; i < count; i++) {
      this.durations[i] = input.unsignedShort();
      this.phases[i] = input.unsignedShort();
    }
  }

  reset() {
    this.ticks = 0;
    this.phaseIndex = 0;
    this.step = 0;
    this.amplitude = 0;
    this.max = 0;
  }

  stepFor(period: number) {
    if (this.max >= this.ticks) {
      this.amplitude = this.phases[this.phaseIndex++] << 15;
      if (this.phaseIndex >= this.durations.length) this.phaseIndex = this.durations.length - 1;
      this.ticks = Math.trunc((this.durations[this.phaseIndex] / 65536) * period);
      if (this.ticks > this.max) {
        this.step = Math.trunc(((this.phases[this.phaseIndex] << 15) - this.amplitude) / (this.ticks - this.max));
      }
    }
    this.amplitude = (this.amplitude + this.step) | 0;
    this.max++;
    return (this.amplitude - this.step) >> 15;
  }
}

const f32 = Math.fround || ((value: number) => value);

class SoundFilter {
  readonly pairs = [0, 0];
  readonly phases = Array.from({ length: 2 }, () => Array.from({ length: 2 }, () => new Array(4).fill(0)));
  readonly magnitudes = Array.from({ length: 2 }, () => Array.from({ length: 2 }, () => new Array(4).fill(0)));
  readonly unity = [0, 0];
  readonly coefficients = [new Int32Array(8), new Int32Array(8)];
  private readonly minimizedCoefficients = [new Float32Array(8), new Float32Array(8)];
  forwardMultiplier = 0;
  private forwardCoefficientMultiplier = 0;

  decode(input: SoundInput, envelope: SoundEnvelope) {
    const count = input.unsignedByte();
    this.pairs[0] = count >> 4;
    this.pairs[1] = count & 15;
    if (this.pairs[0] > 4 || this.pairs[1] > 4) throw new RangeError("Sound filter has more than four pairs");
    if (count === 0) return;

    this.unity[0] = input.unsignedShort();
    this.unity[1] = input.unsignedShort();
    const migrated = input.unsignedByte();
    for (let direction = 0; direction < 2; direction++) {
      for (let pair = 0; pair < this.pairs[direction]; pair++) {
        this.phases[direction][0][pair] = input.unsignedShort();
        this.magnitudes[direction][0][pair] = input.unsignedShort();
      }
    }
    for (let direction = 0; direction < 2; direction++) {
      for (let pair = 0; pair < this.pairs[direction]; pair++) {
        if ((migrated & (1 << (direction * 4 + pair))) !== 0) {
          this.phases[direction][1][pair] = input.unsignedShort();
          this.magnitudes[direction][1][pair] = input.unsignedShort();
        } else {
          this.phases[direction][1][pair] = this.phases[direction][0][pair];
          this.magnitudes[direction][1][pair] = this.magnitudes[direction][0][pair];
        }
      }
    }
    if (migrated !== 0 || this.unity[1] !== this.unity[0]) envelope.decodeSegments(input);
  }

  compute(direction: number, factor: number) {
    if (direction === 0) {
      let magnitude = f32(f32(this.unity[0]) + f32(f32(this.unity[1] - this.unity[0]) * factor));
      magnitude = f32(magnitude * f32(0.0030517578));
      this.forwardCoefficientMultiplier = f32(Math.pow(0.1, f32(magnitude / f32(20))));
      this.forwardMultiplier = Math.trunc(f32(this.forwardCoefficientMultiplier * f32(65536)));
    }
    if (this.pairs[direction] === 0) return 0;

    let magnitude = this.adaptMagnitude(direction, 0, factor);
    const coefficients = this.minimizedCoefficients[direction];
    coefficients[0] = f32(f32(-2 * magnitude) * f32(Math.cos(this.adaptPhase(direction, 0, factor))));
    coefficients[1] = f32(magnitude * magnitude);
    for (let pair = 1; pair < this.pairs[direction]; pair++) {
      magnitude = this.adaptMagnitude(direction, pair, factor);
      const phase = f32(f32(-2 * magnitude) * f32(Math.cos(this.adaptPhase(direction, pair, factor))));
      const coefficient = f32(magnitude * magnitude);
      coefficients[pair * 2 + 1] = f32(coefficients[pair * 2 - 1] * coefficient);
      coefficients[pair * 2] = f32(
        f32(coefficients[pair * 2 - 1] * phase) + f32(coefficients[pair * 2 - 2] * coefficient),
      );
      for (let other = pair * 2 - 1; other >= 2; other--) {
        coefficients[other] = f32(
          coefficients[other] +
            f32(f32(coefficients[other - 1] * phase) + f32(coefficients[other - 2] * coefficient)),
        );
      }
      coefficients[1] = f32(coefficients[1] + f32(f32(coefficients[0] * phase) + coefficient));
      coefficients[0] = f32(coefficients[0] + phase);
    }
    if (direction === 0) {
      for (let pair = 0; pair < this.pairs[0] * 2; pair++) {
        coefficients[pair] = f32(coefficients[pair] * this.forwardCoefficientMultiplier);
      }
    }
    for (let pair = 0; pair < this.pairs[direction] * 2; pair++) {
      this.coefficients[direction][pair] = Math.trunc(f32(coefficients[pair] * f32(65536)));
    }
    return this.pairs[direction] * 2;
  }

  private adaptMagnitude(direction: number, pair: number, factor: number) {
    let alpha = f32(
      f32(this.magnitudes[direction][0][pair]) +
        f32(factor * f32(this.magnitudes[direction][1][pair] - this.magnitudes[direction][0][pair])),
    );
    alpha = f32(alpha * f32(0.0015258789));
    return f32(f32(1) - f32(Math.pow(10, f32(-alpha / f32(20)))));
  }

  private adaptPhase(direction: number, pair: number, factor: number) {
    let alpha = f32(
      f32(this.phases[direction][0][pair]) +
        f32(factor * f32(this.phases[direction][1][pair] - this.phases[direction][0][pair])),
    );
    alpha = f32(alpha * f32(1.2207031e-4));
    const frequency = f32(f32(32.703197) * f32(Math.pow(2, alpha)));
    return f32(f32(frequency * f32(3.1415927)) / f32(11025));
  }
}

function createNoise() {
  const noise = new Int8Array(32768);
  let low = 0xe66d;
  let middle = 0xdeec;
  let high = 0x0005;
  for (let i = 0; i < noise.length; i++) {
    const product0 = low * 0xe66d + 0xb;
    const nextLow = product0 % 65536;
    const product1 = middle * 0xe66d + low * 0xdeec + Math.floor(product0 / 65536);
    const nextMiddle = product1 % 65536;
    const product2 = high * 0xe66d + middle * 0xdeec + low * 5 + Math.floor(product1 / 65536);
    low = nextLow;
    middle = nextMiddle;
    high = product2 % 65536;
    noise[i] = (middle & 2) - 1;
  }
  return noise;
}

const TONE_NOISE = createNoise();
const TONE_SINE = Int32Array.from({ length: 32768 }, (_, i) => Math.trunc(Math.sin(i / 5215.1903) * 16384));

function shiftedLongProduct(left: number, right: number) {
  return Math.floor((left * right) / 65536) | 0;
}

class SoundTone {
  pitch: SoundEnvelope;
  volume: SoundEnvelope;
  pitchModifier?: SoundEnvelope;
  pitchModifierAmplitude?: SoundEnvelope;
  volumeMultiplier?: SoundEnvelope;
  volumeMultiplierAmplitude?: SoundEnvelope;
  release?: SoundEnvelope;
  attack?: SoundEnvelope;
  readonly oscillatorVolume = new Int32Array(5);
  readonly oscillatorPitch = new Int32Array(5);
  readonly oscillatorDelays = new Int32Array(5);
  delayTime = 0;
  delayDecay = 100;
  duration = 500;
  offset = 0;
  filter: SoundFilter;
  filterEnvelope: SoundEnvelope;

  constructor(input: SoundInput) {
    this.pitch = new SoundEnvelope();
    this.pitch.decode(input);
    this.volume = new SoundEnvelope();
    this.volume.decode(input);
    if (this.optional(input)) {
      this.pitchModifier = new SoundEnvelope();
      this.pitchModifier.decode(input);
      this.pitchModifierAmplitude = new SoundEnvelope();
      this.pitchModifierAmplitude.decode(input);
    }
    if (this.optional(input)) {
      this.volumeMultiplier = new SoundEnvelope();
      this.volumeMultiplier.decode(input);
      this.volumeMultiplierAmplitude = new SoundEnvelope();
      this.volumeMultiplierAmplitude.decode(input);
    }
    if (this.optional(input)) {
      this.release = new SoundEnvelope();
      this.release.decode(input);
      this.attack = new SoundEnvelope();
      this.attack.decode(input);
    }
    for (let oscillator = 0; oscillator < 10; oscillator++) {
      const volume = input.unsignedShortSmart();
      if (volume === 0) break;
      if (oscillator >= 5) throw new RangeError("Sound effect has more than five oscillators");
      this.oscillatorVolume[oscillator] = volume;
      this.oscillatorPitch[oscillator] = input.shortSmart();
      this.oscillatorDelays[oscillator] = input.unsignedShortSmart();
    }
    this.delayTime = input.unsignedShortSmart();
    this.delayDecay = input.unsignedShortSmart();
    this.duration = input.unsignedShort();
    this.offset = input.unsignedShort();
    this.filter = new SoundFilter();
    this.filterEnvelope = new SoundEnvelope();
    this.filter.decode(input, this.filterEnvelope);
  }

  private optional(input: SoundInput) {
    const present = input.unsignedByte() !== 0;
    if (present) input.offset--;
    return present;
  }

  synthesize(sampleCount: number) {
    const samples = new Int32Array(sampleCount);
    if (this.duration < 10) return samples;
    const samplesPerMillisecond = sampleCount / this.duration;
    this.pitch.reset();
    this.volume.reset();

    let pitchModulationStep = 0;
    let pitchModulationBaseStep = 0;
    let pitchModulationPhase = 0;
    if (this.pitchModifier) {
      this.pitchModifier.reset();
      this.pitchModifierAmplitude.reset();
      pitchModulationStep = Math.trunc(
        ((this.pitchModifier.end - this.pitchModifier.start) * 32.768) / samplesPerMillisecond,
      );
      pitchModulationBaseStep = Math.trunc((this.pitchModifier.start * 32.768) / samplesPerMillisecond);
    }

    let volumeModulationStep = 0;
    let volumeModulationBaseStep = 0;
    let volumeModulationPhase = 0;
    if (this.volumeMultiplier) {
      this.volumeMultiplier.reset();
      this.volumeMultiplierAmplitude.reset();
      volumeModulationStep = Math.trunc(
        ((this.volumeMultiplier.end - this.volumeMultiplier.start) * 32.768) / samplesPerMillisecond,
      );
      volumeModulationBaseStep = Math.trunc((this.volumeMultiplier.start * 32.768) / samplesPerMillisecond);
    }

    const phases = new Int32Array(5);
    const delays = new Int32Array(5);
    const volumeSteps = new Int32Array(5);
    const pitchSteps = new Int32Array(5);
    const pitchBaseSteps = new Int32Array(5);
    for (let oscillator = 0; oscillator < 5; oscillator++) {
      if (this.oscillatorVolume[oscillator] !== 0) {
        delays[oscillator] = Math.trunc(this.oscillatorDelays[oscillator] * samplesPerMillisecond);
        volumeSteps[oscillator] = Math.trunc((this.oscillatorVolume[oscillator] << 14) / 100);
        pitchSteps[oscillator] = Math.trunc(
          ((this.pitch.end - this.pitch.start) *
            32.768 *
            Math.pow(1.0057929410678534, this.oscillatorPitch[oscillator])) /
            samplesPerMillisecond,
        );
        pitchBaseSteps[oscillator] = Math.trunc((this.pitch.start * 32.768) / samplesPerMillisecond);
      }
    }

    for (let sample = 0; sample < sampleCount; sample++) {
      let pitchChange = this.pitch.stepFor(sampleCount);
      let volumeChange = this.volume.stepFor(sampleCount);
      if (this.pitchModifier) {
        const modulation = this.pitchModifier.stepFor(sampleCount);
        const amplitude = this.pitchModifierAmplitude.stepFor(sampleCount);
        pitchChange =
          (pitchChange + (this.evaluateWave(pitchModulationPhase, amplitude, this.pitchModifier.form) >> 1)) | 0;
        pitchModulationPhase =
          (pitchModulationPhase + pitchModulationBaseStep + (Math.imul(modulation, pitchModulationStep) >> 16)) | 0;
      }
      if (this.volumeMultiplier) {
        const modulation = this.volumeMultiplier.stepFor(sampleCount);
        const amplitude = this.volumeMultiplierAmplitude.stepFor(sampleCount);
        volumeChange =
          Math.imul(
            volumeChange,
            (this.evaluateWave(volumeModulationPhase, amplitude, this.volumeMultiplier.form) >> 1) + 32768,
          ) >> 15;
        volumeModulationPhase =
          (volumeModulationPhase + volumeModulationBaseStep + (Math.imul(modulation, volumeModulationStep) >> 16)) | 0;
      }
      for (let oscillator = 0; oscillator < 5; oscillator++) {
        if (this.oscillatorVolume[oscillator] === 0) continue;
        const output = delays[oscillator] + sample;
        if (output < sampleCount) {
          samples[output] += this.evaluateWave(
            phases[oscillator],
            Math.imul(volumeChange, volumeSteps[oscillator]) >> 15,
            this.pitch.form,
          );
          phases[oscillator] += (Math.imul(pitchChange, pitchSteps[oscillator]) >> 16) + pitchBaseSteps[oscillator];
        }
      }
    }

    if (this.release) {
      this.release.reset();
      this.attack.reset();
      let counter = 0;
      let muted = true;
      for (let sample = 0; sample < sampleCount; sample++) {
        const release = this.release.stepFor(sampleCount);
        const attack = this.attack.stepFor(sampleCount);
        const threshold =
          ((Math.imul(muted ? release : attack, this.release.end - this.release.start) >> 8) + this.release.start) | 0;
        counter += 256;
        if (counter >= threshold) {
          counter = 0;
          muted = !muted;
        }
        if (muted) samples[sample] = 0;
      }
    }

    if (this.delayTime > 0 && this.delayDecay > 0) {
      const delay = Math.trunc(this.delayTime * samplesPerMillisecond);
      for (let sample = delay; sample < sampleCount; sample++) {
        samples[sample] += Math.trunc(Math.imul(samples[sample - delay], this.delayDecay) / 100);
      }
    }

    this.applyFilter(samples);
    for (let sample = 0; sample < sampleCount; sample++) {
      if (samples[sample] < -32768) samples[sample] = -32768;
      else if (samples[sample] > 32767) samples[sample] = 32767;
    }
    return samples;
  }

  private applyFilter(samples: Int32Array) {
    const sampleCount = samples.length;
    if (this.filter.pairs[0] === 0 && this.filter.pairs[1] === 0) return;
    this.filterEnvelope.reset();
    let envelope = this.filterEnvelope.stepFor(sampleCount + 1);
    let forwardOrder = this.filter.compute(0, f32(envelope / 65536));
    let feedbackOrder = this.filter.compute(1, f32(envelope / 65536));
    if (sampleCount < forwardOrder + feedbackOrder) return;

    let sample = 0;
    let blockEnd = Math.min(feedbackOrder, sampleCount - forwardOrder);
    while (sample < blockEnd) {
      let value = shiftedLongProduct(samples[sample + forwardOrder], this.filter.forwardMultiplier);
      for (let coefficient = 0; coefficient < forwardOrder; coefficient++) {
        value =
          (value +
            shiftedLongProduct(
              samples[sample + forwardOrder - 1 - coefficient],
              this.filter.coefficients[0][coefficient],
            )) |
          0;
      }
      for (let coefficient = 0; coefficient < sample; coefficient++) {
        value =
          (value - shiftedLongProduct(samples[sample - 1 - coefficient], this.filter.coefficients[1][coefficient])) | 0;
      }
      samples[sample++] = value;
      envelope = this.filterEnvelope.stepFor(sampleCount + 1);
    }

    blockEnd = 128;
    for (;;) {
      blockEnd = Math.min(blockEnd, sampleCount - forwardOrder);
      while (sample < blockEnd) {
        let value = shiftedLongProduct(samples[sample + forwardOrder], this.filter.forwardMultiplier);
        for (let coefficient = 0; coefficient < forwardOrder; coefficient++) {
          value =
            (value +
              shiftedLongProduct(
                samples[sample + forwardOrder - 1 - coefficient],
                this.filter.coefficients[0][coefficient],
              )) |
            0;
        }
        for (let coefficient = 0; coefficient < feedbackOrder; coefficient++) {
          value =
            (value - shiftedLongProduct(samples[sample - 1 - coefficient], this.filter.coefficients[1][coefficient])) |
            0;
        }
        samples[sample++] = value;
        envelope = this.filterEnvelope.stepFor(sampleCount + 1);
      }
      if (sample >= sampleCount - forwardOrder) {
        while (sample < sampleCount) {
          let value = 0;
          for (let coefficient = sample + forwardOrder - sampleCount; coefficient < forwardOrder; coefficient++) {
            value =
              (value +
                shiftedLongProduct(
                  samples[sample + forwardOrder - 1 - coefficient],
                  this.filter.coefficients[0][coefficient],
                )) |
              0;
          }
          for (let coefficient = 0; coefficient < feedbackOrder; coefficient++) {
            value =
              (value -
                shiftedLongProduct(samples[sample - 1 - coefficient], this.filter.coefficients[1][coefficient])) |
              0;
          }
          samples[sample++] = value;
          this.filterEnvelope.stepFor(sampleCount + 1);
        }
        break;
      }
      forwardOrder = this.filter.compute(0, f32(envelope / 65536));
      feedbackOrder = this.filter.compute(1, f32(envelope / 65536));
      blockEnd += 128;
    }
  }

  private evaluateWave(phase: number, amplitude: number, form: number) {
    if (form === 1) return (phase & 32767) < 16384 ? amplitude : -amplitude;
    if (form === 2) return Math.imul(TONE_SINE[phase & 32767], amplitude) >> 14;
    if (form === 3) return (Math.imul(amplitude, phase & 32767) >> 14) - amplitude;
    if (form === 4) return Math.imul(amplitude, TONE_NOISE[Math.trunc(phase / 2607) & 32767]);
    return 0;
  }
}

export class SoundEffectDefinition {
  readonly tones: Array<SoundTone | undefined> = new Array(10);
  readonly loopStartMilliseconds: number;
  readonly loopEndMilliseconds: number;

  constructor(bytes: Uint8Array) {
    const input = new SoundInput(bytes);
    for (let i = 0; i < this.tones.length; i++) {
      const present = input.unsignedByte() !== 0;
      if (present) {
        input.offset--;
        this.tones[i] = new SoundTone(input);
      }
    }
    this.loopStartMilliseconds = input.unsignedShort();
    this.loopEndMilliseconds = input.unsignedShort();
  }

  toRawSound(): RawSound {
    let durationMilliseconds = 0;
    for (const tone of this.tones) {
      if (tone) durationMilliseconds = Math.max(durationMilliseconds, tone.duration + tone.offset);
    }
    const mixed = new Int8Array(Math.trunc((durationMilliseconds * SOUND_EFFECT_SAMPLE_RATE) / 1000));
    for (const tone of this.tones) {
      if (!tone) continue;
      const sampleCount = Math.trunc((tone.duration * SOUND_EFFECT_SAMPLE_RATE) / 1000);
      const sampleOffset = Math.trunc((tone.offset * SOUND_EFFECT_SAMPLE_RATE) / 1000);
      const samples = tone.synthesize(sampleCount);
      for (let sample = 0; sample < sampleCount; sample++) {
        let value = (samples[sample] >> 8) + mixed[sample + sampleOffset];
        if (((value + 128) & -256) !== 0) value = (value >> 31) ^ 127;
        mixed[sample + sampleOffset] = value;
      }
    }
    return {
      sampleRate: SOUND_EFFECT_SAMPLE_RATE,
      samples: mixed,
      loopStart: Math.trunc((this.loopStartMilliseconds * SOUND_EFFECT_SAMPLE_RATE) / 1000),
      loopEnd: Math.trunc((this.loopEndMilliseconds * SOUND_EFFECT_SAMPLE_RATE) / 1000),
    };
  }
}

export function synthesizeSoundEffect(bytes: Uint8Array) {
  return new SoundEffectDefinition(bytes).toRawSound();
}
