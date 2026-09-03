"use strict";

import { BasePrayer, PrayerGroups } from "../../sdk/BasePrayer";
import { Settings } from "../../sdk/Settings";
import { cacheSound } from "../../sdk/audio/CacheSoundEffects";
import { CACHE_ASSETS } from "../../assets/CacheAssets";
import { Sound, SoundCache } from "../../sdk/utils/SoundCache";

export class Rigour extends BasePrayer {
  get name() {
    return "Rigour";
  }

  get groups(): PrayerGroups[] {
    return [PrayerGroups.ACCURACY, PrayerGroups.STRENGTH, PrayerGroups.DEFENCE];
  }

  levelRequirement(): number {
    return 74;
  }
  drainRate(): number {
    return 24;
  }

  isOverhead() {
    return false;
  }

  feature() {
    return "offensiveRange";
  }

  playOnSound() {
    if (Settings.playsAudio) {
      SoundCache.play(new Sound(cacheSound(CACHE_ASSETS.sounds.rigour.id), 0.2));
    }
  }

  playOffSound() {
    if (Settings.playsAudio) {
      SoundCache.play(new Sound(cacheSound(CACHE_ASSETS.sounds.prayerDeactivated.id), 0.2));
    }
  }
}
