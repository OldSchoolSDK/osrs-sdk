import SoulreaperAxeImage from "../../assets/images/weapons/Soulreaper_axe.png";
import ScytheAttackSound from "../../assets/sounds/scythe_swing_2524.ogg";
import type { ProjectileOptions } from "../../sdk";
import { AttackStyle, AttackStyleTypes } from "../../sdk/AttackStylesController";
import type { AttackBonuses } from "../../sdk/gear/Weapon";
import { ItemName } from "../../sdk/ItemName";
import { PlayerAnimationIndices } from "../../sdk/rendering/GLTFAnimationConstants";
import type { Unit } from "../../sdk/Unit";
import { Assets } from "../../sdk/utils/Assets";
import { Sound } from "../../sdk/utils/SoundCache";
import { MeleeWeapon } from "../../sdk/weapons/MeleeWeapon";

export class SoulreaperAxe extends MeleeWeapon {
  constructor() {
    super();

    this.bonuses = {
      attack: {
        stab: 28,
        slash: 134,
        crush: 66,
        magic: 0,
        range: 0,
      },
      defence: {
        stab: 0,
        slash: 0,
        crush: 0,
        magic: 0,
        range: 0,
      },
      other: {
        meleeStrength: 121,
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

  attackStyles() {
    return [AttackStyle.ACCURATE,AttackStyle.AGGRESSIVESLASH, AttackStyle.AGGRESSIVECRUSH, AttackStyle.DEFENSIVE];
  }

  attackStyleCategory(): AttackStyleTypes {
    return AttackStyleTypes.AXE;
  }

  defaultStyle(): AttackStyle {
    return AttackStyle.AGGRESSIVESLASH;
  }

  get itemName(): ItemName {
    return ItemName.SOULREAPER_AXE;
  }

  get isTwoHander(): boolean {
    return true;
  }

  hasSpecialAttack(): boolean {
    return true;
  }

  specialAttack(from: Unit, to: Unit, bonuses?: AttackBonuses, _options?: ProjectileOptions): void {
    // the wiki says: When using Behead, the Strength boost from Soul stacks
    // is consumed first and a new separate damage bonus is applied to the
    // swing. Although there can be slight differences because of the order of
    // operations, Behead typically deals a similar maximum hit as a player that
    // does nothing and continues to auto attack (typically within 0-3 points of
    // damage).

    // this doesn't really do any of that and does a regular attack with 30%
    // bonus to the attack roll, which might be a small bug?
    const originalStacks = from.soulreaperAxeStacks;
    super.attack(from, to, bonuses)
    from.currentStats.hitpoint = Math.min(99, from.currentStats.hitpoint + 8 * originalStacks);
    from.currentStats.hitpoint = Math.min(from.currentStats.hitpoint, from.stats.hitpoint);
    from.soulreaperAxeStacks = 0;
  }

  get attackRange() {
    return 1;
  }

  get attackSpeed() {
    return 5;
  }

  get inventoryImage() {
    return SoulreaperAxeImage;
  }

  private Model = Assets.getAssetUrl("models/player_soulreaper_axe.glb");
  override get model() {
    return this.Model;
  }

  // FIXME: missing soulreaper axe animation and pose
  override get attackAnimationId() {
    return PlayerAnimationIndices.SwordSlash;
  }

  override get idleAnimationId() {
    return PlayerAnimationIndices.Idle;
  }

  _damageMultiplier(from: Unit, to: Unit, bonuses: AttackBonuses) {
      return from.bonuses.other.crystalDamage || 1;
    }

  get attackSound() {
    // stab should use staff_stab.ogg
    return new Sound(ScytheAttackSound, 0.1);
  }
}