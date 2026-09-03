"use strict";

import BPInventImage from "../../assets/images/weapons/blowpipe.png";
import { RangedWeapon } from "../../sdk/weapons/RangedWeapon";
import { ItemName } from "../../sdk/ItemName";
import { Unit } from "../../sdk/Unit";
import { AttackBonuses } from "../../sdk/gear/Weapon";
import { AttackStyle, AttackStyleTypes } from "../../sdk/AttackStylesController";
import { ArcProjectileMotionInterpolator, Projectile, ProjectileOptions } from "../../sdk/weapons/Projectile";

import { cacheSound } from "../../sdk/audio/CacheSoundEffects";
import { CACHE_ASSETS } from "../../assets/CacheAssets";
import { Sound, SoundCache } from "../../sdk/utils/SoundCache";

import { PlayerAnimationIndices } from "../../sdk/rendering/GLTFAnimationConstants";
import { Assets } from "../../sdk/utils/Assets";

export class Blowpipe extends RangedWeapon {
  override get equipSoundId(): number {
    return CACHE_ASSETS.sounds.equipStaff.id;
  }

  get cacheItemId(): number {
    return CACHE_ASSETS.items.toxicBlowpipe.id;
  }
  constructor() {
    super({
      modelScale: 1 / 128,
      visualDelayTicks: 1,
      visualHitEarlyTicks: 0,
      verticalOffset: -0.75,
      motionInterpolator: new ArcProjectileMotionInterpolator(0.5),
    });
    this.bonuses = {
      attack: {
        stab: 0,
        slash: 0,
        crush: 0,
        magic: 0,
        range: 30,
      },
      defence: {
        stab: 0,
        slash: 0,
        crush: 0,
        magic: 0,
        range: 0,
      },
      other: {
        meleeStrength: 0,
        rangedStrength: 20 + 35, // simulating dragon darts atm
        magicDamage: 0,
        prayer: 0,
      },
      targetSpecific: {
        undead: 0,
        slayer: 0,
      },
    };
    SoundCache.preload(this.attackSound.src);
  }

  calculateHitDelay(distance: number) {
    return Math.floor(distance / 6) + 1;
  }

  attackStyles() {
    return [AttackStyle.ACCURATE, AttackStyle.RAPID, AttackStyle.LONGRANGE];
  }

  attackStyleCategory(): AttackStyleTypes {
    return AttackStyleTypes.THROWN;
  }

  defaultStyle(): AttackStyle {
    return AttackStyle.RAPID;
  }

  get attackRange() {
    if (this.attackStyle() === AttackStyle.LONGRANGE) {
      return 7;
    }
    return 5;
  }

  get attackSpeed() {
    if (this.attackStyle() === AttackStyle.LONGRANGE) {
      return 3;
    }
    return 2;
  }

  get weight(): number {
    return 0.5;
  }

  specialAttack(from: Unit, to: Unit, bonuses: AttackBonuses = {}, options: ProjectileOptions = {}) {
    super.specialAttack(from, to, bonuses, options);
    bonuses.isSpecialAttack = true;
    // BP special attack takes an extra tick to land
    const didAttack = super.attack(from, to, bonuses, {
      ...options,
      reduceDelay: -1,
      visualHitEarlyTicks: 1,
      visualDelayTicks: 1,
      projectileSound: this.specialAttackSound,
    });

    const healAttackerBy = Math.floor(this.damageRoll / 2);
    from.currentStats.hitpoint += healAttackerBy;
    from.currentStats.hitpoint = Math.min(from.currentStats.hitpoint, from.stats.hitpoint);
    return didAttack;
  }

  _damageMultiplier(from: Unit, to: Unit, bonuses: AttackBonuses) {
    if (bonuses.isSpecialAttack) {
      return 1.5;
    }
    return 1;
  }
  _accuracyMultiplier(from: Unit, to: Unit, bonuses: AttackBonuses) {
    if (bonuses.isSpecialAttack) {
      return 2;
    }
    return 1;
  }

  get itemName(): ItemName {
    return ItemName.TOXIC_BLOWPIPE;
  }

  get isTwoHander(): boolean {
    return true;
  }

  hasSpecialAttack(): boolean {
    return true;
  }
  get inventoryImage() {
    return BPInventImage;
  }

  get attackSound() {
    return new Sound(cacheSound(CACHE_ASSETS.sounds.blowpipeAttack.id), 0.1);
  }

  get specialAttackSound() {
    return new Sound(cacheSound(CACHE_ASSETS.sounds.blowpipeSpecial.id), 0.5);
  }

  Model = Assets.getAssetUrl("models/player_toxic_blowpipe.glb");
  override get model() {
    return this.Model;
  }

  get attackAnimationId() {
    return PlayerAnimationIndices.FireBlowpipe;
  }

  ProjectileModel = Assets.getAssetUrl("models/dragon_dart.glb");
  get projectileModel() {
    return this.ProjectileModel;
  }
}
