"use strict";

import InventImage from "../../assets/images/weapons/Nightmare_staff.png";
import { MeleeWeapon } from "../../sdk/weapons/MeleeWeapon";
import { ItemName } from "../../sdk/ItemName";
import { AttackStyle, AttackStyleTypes } from "../../sdk/AttackStylesController";
import { BarrageSpell } from "../../sdk/weapons/BarrageSpell";
import { AttackBonuses } from "../../sdk/gear/Weapon";
import { Unit } from "../../sdk/Unit";
import { Player } from "../../sdk/Player";
import { BloodBarrageSpell } from "../../sdk/weapons/BloodBarrageSpell";
import { Assets } from "../../sdk";
import { PlayerAnimationIndices } from "../../sdk/rendering";

export class NightmareStaff extends MeleeWeapon {
  autocastSpell: BarrageSpell = new BloodBarrageSpell();

  constructor() {
    super();

    this.bonuses = {
      attack: {
        stab: 0,
        slash: 0,
        crush: 0,
        magic: 16,
        range: 0,
      },
      defence: {
        stab: 0,
        slash: 0,
        crush: 0,
        magic: 14,
        range: 0,
      },
      other: {
        meleeStrength: 0,
        rangedStrength: 0,
        magicDamage: 0.15,
        prayer: 0,
      },
      targetSpecific: {
        undead: 0,
        slayer: 0,
      },
    };
  }

  attack(from: Unit, to: Unit, bonuses: AttackBonuses = {}): boolean {
    if (this.attackStyle() === AttackStyle.AUTOCAST) {
      if (from.isPlayer) {
        this.autocastSpell.cast(from, to);
        return true;
      }
    }

    return super.attack(from, to, bonuses);
  }

  attackStyles() {
    return [AttackStyle.ACCURATE, AttackStyle.AGGRESSIVECRUSH, AttackStyle.DEFENSIVE, AttackStyle.AUTOCAST];
  }

  attackStyleCategory(): AttackStyleTypes {
    return AttackStyleTypes.STAFF;
  }

  defaultStyle(): AttackStyle {
    return AttackStyle.AUTOCAST;
  }

  get weight(): number {
    return 0.198;
  }

  get itemName(): ItemName {
    return ItemName.NIGHTMARE_STAFF;
  }

  get isTwoHander(): boolean {
    return false;
  }

  hasSpecialAttack(): boolean {
    return false;
  }

  get attackRange() {
    if (this.attackStyle() === AttackStyle.AUTOCAST) {
      return 10;
    }
    return 1;
  }

  get attackSpeed() {
    if (this.attackStyle() === AttackStyle.AUTOCAST) {
      return 5;
    }
    return 4;
  }

  get inventoryImage() {
    return InventImage;
  }

  Model = Assets.getAssetUrl("models/player_nightmare_staff.glb");
  override get model() {
    return this.Model;
  }

  get attackAnimationId() {
    return PlayerAnimationIndices.Barrage;
  }
}
