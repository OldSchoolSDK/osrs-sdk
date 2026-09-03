"use strict";

import { BasePrayer, PrayerGroups } from "../../sdk/BasePrayer";
import { Settings } from "../../sdk/Settings";
import { cacheSound } from "../../sdk/audio/CacheSoundEffects";
import { CACHE_ASSETS } from "../../assets/CacheAssets";
import { Sound, SoundCache } from "../../sdk/utils/SoundCache";

export class Piety extends BasePrayer {
  get name() {
    return "Piety";
  }

  get groups() {
    return [PrayerGroups.ACCURACY, PrayerGroups.STRENGTH, PrayerGroups.DEFENCE];
  }

  levelRequirement(): number {
    return 70;
  }

  drainRate(): number {
    return 24;
  }

  isOverhead() {
    return false;
  }

  feature() {
    return "offensiveAttack";
  }

  playOnSound() {
    if (Settings.playsAudio) {
      SoundCache.play(new Sound(cacheSound(CACHE_ASSETS.sounds.piety.id), 0.2));
    }
  }

  playOffSound() {
    if (Settings.playsAudio) {
      SoundCache.play(new Sound(cacheSound(CACHE_ASSETS.sounds.prayerDeactivated.id), 0.2));
    }
  }
}
