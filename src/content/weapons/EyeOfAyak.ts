"use strict";

import InventImage from "../../assets/images/weapons/Eye_of_Ayak.png";
import { MagicWeapon } from "../../sdk/weapons/MagicWeapon";
import { ItemName } from "../../sdk/ItemName";
import { AttackStyle, AttackStyleTypes } from "../../sdk/AttackStylesController";
import { AttackBonuses } from "../../sdk/gear/Weapon";
import { Sound } from "../../sdk/utils/SoundCache";
import { Unit } from "../../sdk/Unit";

import { cacheSound } from "../../sdk/audio/CacheSoundEffects";
import { CACHE_ASSETS } from "../../assets/CacheAssets";
import { PlayerAnimationIndices } from "../../sdk/rendering/GLTFAnimationConstants";

export class EyeOfAyak extends MagicWeapon {

  get cacheItemId(): number { return CACHE_ASSETS.items.eyeOfAyak.id; }

  maxConcurrentHits = 9;

  constructor() {
    super({
      visuals: {
        spotAnim: {
          // TODO
          id: CACHE_ASSETS.spotAnims.scytheEast.id
        },
        startCycleOffset: 30,
    }});
    this.bonuses = {
      attack: {
        stab: 0,
        slash: 0,
        crush: 0,
        magic: 30,
        range: 0,
      },
      defence: {
        stab: 1,
        slash: 5,
        crush: 5,
        magic: 10,
        range: 0,
      },
      other: {
        meleeStrength: 0,
        rangedStrength: 0,
        magicDamage: 0,
        prayer: 2,
      },
      targetSpecific: {
        undead: 0,
        slayer: 0,
      },
    };
  }

  calculateHitDelay(distance: number) {
    return Math.floor((1 + distance) / 3) + 1;
  }

  attackStyles() {
    return [AttackStyle.ACCURATE, AttackStyle.LONGRANGE];
  }

  attackStyleCategory(): AttackStyleTypes {
    return AttackStyleTypes.POWEREDSTAFF;
  }

  defaultStyle(): AttackStyle {
    return AttackStyle.LONGRANGE;
  }

  get attackSpeed() {
    if (this.attackStyle() === AttackStyle.MEDIUM_FUSE) {
      return 3;
    }
    return 4;
  }

  get weight(): number {
    return 0;
  }

  get itemName(): ItemName {
    return ItemName.EYE_OF_AYAK;
  }

  get isTwoHander(): boolean {
    return false;
  }

  get attackRange() {
    if (this.attackStyle() === AttackStyle.LONGRANGE) {
      return 8;
    }
    return 6;
  }

  get inventoryImage() {
    return InventImage;
  }

  get attackSound() {
    // TODO
    return new Sound(cacheSound(CACHE_ASSETS.sounds.twistedBowAttack.id), 0.1);
  }

  get attackAnimationId() {
    // TODO
    return PlayerAnimationIndices.ThrowChinchompa;
  }

  // TODO
  override _maxHit(from: Unit, to: Unit, bonuses: AttackBonuses) {
    return 28;
  }
}
