import ZombieAxeImage from "../../assets/images/weapons/Zombie_axe.png";
import { AttackStyle, AttackStyleTypes } from "../../sdk/AttackStylesController";
import { ItemName } from "../../sdk/ItemName";
import { PlayerAnimationIndices } from "../../sdk/rendering/GLTFAnimationConstants";
import { Sound } from "../../sdk/utils/SoundCache";
import { Unit, UnitTypes } from "../../sdk/Unit";
import { AttackBonuses } from "../../sdk/gear/Weapon";
import { ProjectileOptions } from "../../sdk/weapons/Projectile";
import { MeleeWeapon } from "../../sdk/weapons/MeleeWeapon";

import { cacheSound } from "../../sdk/audio/CacheSoundEffects";
import { CACHE_ASSETS } from "../../assets/CacheAssets";

export class ZombieAxe extends MeleeWeapon {
  get cacheItemId(): number { return CACHE_ASSETS.items.zombieAxe.id; }
  constructor() {
    super();

    this.bonuses = {
      attack: {
        stab: -3,
        slash: 105,
        crush: 90,
        magic: 0,
        range: 0,
      },
      defence: {
        stab: -1,
        slash: 0,
        crush: 0,
        magic: 0,
        range: -1,
      },
      other: {
        meleeStrength: 107,
        rangedStrength: 0,
        magicDamage: 0,
        prayer: 0,
      },
      targetSpecific: {
        undead: 0,
        slayer: 0,
      },
    };
  }

  get weight(): number {
    return 2.721;
  }

  attackStyles() {
    return [AttackStyle.ACCURATE, AttackStyle.AGGRESSIVESLASH, AttackStyle.AGGRESSIVECRUSH, AttackStyle.DEFENSIVE];
  }

  attackStyleCategory(): AttackStyleTypes {
    return AttackStyleTypes.AXE;
  }

  defaultStyle(): AttackStyle {
    return AttackStyle.AGGRESSIVESLASH;
  }

  get itemName(): ItemName {
    return ItemName.ZOMBIE_AXE;
  }

  get isTwoHander(): boolean {
    return false;
  }

  hasSpecialAttack(): boolean {
    return false;
  }

  get attackRange() {
    return 1;
  }

  get attackSpeed() {
    return 5;
  }

  get inventoryImage() {
    return ZombieAxeImage;
  }

  override attack(from: Unit, to: Unit, bonuses: AttackBonuses = {}, options: ProjectileOptions = {}) {
    return super.attack(from, to, {
      ...bonuses,
      attackStyle: bonuses.attackStyle ?? (this.attackStyle() === AttackStyle.AGGRESSIVECRUSH ? "crush" : "slash"),
    }, options);
  }

  override _attackLevel(from: Unit, to: Unit, bonuses: AttackBonuses) {
    return super._attackLevel(from, to, {
      ...bonuses,
      styleBonus: from.type === UnitTypes.PLAYER && this.attackStyle() === AttackStyle.ACCURATE ? 3 : 0,
    });
  }

  override _defenceLevel(from: Unit, to: Unit, bonuses: AttackBonuses) {
    return super._defenceLevel(from, to, {
      ...bonuses,
      styleBonus: this.attackStyle() === AttackStyle.DEFENSIVE ? 3 : 0,
    });
  }

  override get attackAnimationId() {
    return this.attackStyle() === AttackStyle.AGGRESSIVECRUSH
      ? PlayerAnimationIndices.ZombieAxeCrush
      : PlayerAnimationIndices.ZombieAxeSlash;
  }

  override get idleAnimationId() {
    // User-confirmed pose: cache sequence 808 (the shared idle animation).
    return PlayerAnimationIndices.Idle;
  }

  get attackSound() {
    // Slash retains the generic melee fallback until its sound is confirmed.
    const soundId = this.attackStyle() === AttackStyle.AGGRESSIVECRUSH
      ? CACHE_ASSETS.sounds.baxeCrush.id
      : CACHE_ASSETS.sounds.meleeAttack.id;
    return new Sound(cacheSound(soundId), 0.1);
  }
}
