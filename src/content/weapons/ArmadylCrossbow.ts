"use strict";

import InventImage from "../../assets/images/weapons/Armadyl_crossbow.png";
import { Unit } from "../../sdk/Unit";
import { RangedWeapon } from "../../sdk/weapons/RangedWeapon";
import { AttackBonuses } from "../../sdk/gear/Weapon";
import { ItemName } from "../../sdk/ItemName";
import { AttackStyleTypes, AttackStyle } from "../../sdk/AttackStylesController";
import { Projectile, ProjectileOptions } from "../../sdk/weapons/Projectile";
import { Random } from "../../sdk/Random";
import { Assets, Sound } from "../../sdk";
import { PlayerAnimationIndices } from "../../sdk/rendering";
import ACBAttackSound from "../../assets/sounds/crossbow_2695.ogg";
import RubyBoltProcSound from "../../assets/sounds/ruby_bolt_proc.ogg";
import DiamondBoltProcSound from "../../assets/sounds/diamond_bolt_proc.ogg";

import { ArcProjectileMotionInterpolator } from "../../sdk/weapons/Projectile";

export class ArmadylCrossbow extends RangedWeapon {
  private boltProcSound?: Sound;
  constructor() {
    super({
      modelScale: 1 / 128,
      visualDelayTicks: 1,
      visualHitEarlyTicks: 1,
      verticalOffset: -0.75,
      motionInterpolator: new ArcProjectileMotionInterpolator(1),
    });
    this.bonuses = {
      attack: {
        stab: 0,
        slash: 0,
        crush: 0,
        magic: 0,
        range: 100,
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
        rangedStrength: 20,
        magicDamage: 0,
        prayer: 0,
      },
      targetSpecific: {
        undead: 0,
        slayer: 0,
      },
    };
  }

  compatibleAmmo(): ItemName[] {
    return [ItemName.RUBY_BOLTS_E, ItemName.DIAMOND_BOLTS_E, ItemName.RUBY_DRAGON_BOLTS_E, ItemName.DIAMOND_DRAGON_BOLTS_E];
  }

  attackStyles() {
    return [AttackStyle.ACCURATE, AttackStyle.RAPID, AttackStyle.LONGRANGE];
  }

  attackStyleCategory(): AttackStyleTypes {
    return AttackStyleTypes.CROSSBOW;
  }

  defaultStyle(): AttackStyle {
    return AttackStyle.RAPID;
  }

  get weight(): number {
    return 6;
  }

  get itemName(): ItemName {
    return ItemName.ARMADYL_CROSSBOW;
  }

  get isTwoHander(): boolean {
    return false;
  }

  get attackRange() {
    if (this.attackStyle() === AttackStyle.LONGRANGE) {
      return 10;
    }
    return 8;
  }

  get attackSpeed() {
    if (this.attackStyle() === AttackStyle.LONGRANGE) {
      return 6;
    }
    return 5;
  }

  get inventoryImage() {
    return InventImage;
  }

  hasSpecialAttack(): boolean {
    return true;
  }

  specialAttackDrain(): number {
    return 50;
  }

  specialAttack(from: Unit, to: Unit, bonuses: AttackBonuses = {}, options: ProjectileOptions = {}) {
    super.specialAttack(from, to, bonuses, options);
    bonuses.isSpecialAttack = true;
    options.model = Assets.getAssetUrl("models/acb_spec.glb");
    super.attack(from, to, bonuses, options);
  }

  _accuracyMultiplier(from: Unit, to: Unit, bonuses: AttackBonuses) {
    if (bonuses.isSpecialAttack) {
      return 2;
    }
    return 1;
  }

  rollDamage(from: Unit, to: Unit, bonuses: AttackBonuses) {
    // Reset bolt proc sound
    this.boltProcSound = undefined;

    // Determine bolt spec chance (doubled if special attack)
    const rubyChance = bonuses.isSpecialAttack ? 0.132 : 0.066;
    const diamondChance = bonuses.isSpecialAttack ? 0.22 : 0.11;

    if (
      from.equipment.ammo &&
      (from.equipment.ammo.itemName === ItemName.RUBY_BOLTS_E ||
        from.equipment.ammo.itemName === ItemName.RUBY_DRAGON_BOLTS_E) &&
      Random.get() < rubyChance &&
      from.currentStats.hitpoint - Math.floor(from.currentStats.hitpoint * 0.1) > 0
    ) {
      this.damage = to.currentStats.hitpoint * 0.2;
      this.boltProcSound = new Sound(RubyBoltProcSound, 0.5);
      from.addProjectile(
        new Projectile(this, Math.floor(from.currentStats.hitpoint * 0.1), from, from, "rubyboltspec", {
          reduceDelay: 15,
        }),
      );
    } else if (
      from.equipment.ammo &&
      (from.equipment.ammo.itemName === ItemName.DIAMOND_BOLTS_E ||
        from.equipment.ammo.itemName === ItemName.DIAMOND_DRAGON_BOLTS_E) &&
      Random.get() < diamondChance
    ) {
      this.damage = this._calculateHitDamage(from, to, bonuses);
      this.boltProcSound = new Sound(DiamondBoltProcSound, 0.5);
    } else if (from.equipment.ammo) {
      super.rollDamage(from, to, bonuses);
    } else {
      this.damage = -1;
    }
  }

  registerProjectile(from: Unit, to: Unit, bonuses: AttackBonuses, options: ProjectileOptions = {}) {
    if (this.boltProcSound) {
      options.projectileSound = this.boltProcSound;
    }
    super.registerProjectile(from, to, bonuses, options);
  }

  get attackSound() {
    return new Sound(ACBAttackSound, 0.1);
  }

  Model = Assets.getAssetUrl("models/player_armadyl_crossbow.glb");
  override get model() {
    return this.Model;
  }

  get attackAnimationId() {
    return PlayerAnimationIndices.FireCrossbow;
  }

  ProjectileModel = Assets.getAssetUrl("models/dragon_arrow.glb");
  get projectileModel() {
    return this.ProjectileModel;
  }
}