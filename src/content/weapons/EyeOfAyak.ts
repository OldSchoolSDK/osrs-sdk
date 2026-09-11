"use strict";

import InventImage from "../../assets/images/weapons/Eye_of_Ayak.png";
import { PoweredStaff } from "../../sdk/weapons/PoweredStaff";
import { ItemName } from "../../sdk/ItemName";
import { CACHE_ASSETS } from "../../assets/CacheAssets";
import { PlayerAnimationIndices } from "../../sdk/rendering/GLTFAnimationConstants";

export class EyeOfAyak extends PoweredStaff {

  get cacheItemId(): number { return CACHE_ASSETS.items.eyeOfAyak.id; }

  constructor() {
    // The exact cache projectile graphic and client-cycle offsets still need
    // identifying. Until then, use the SDK's neutral magic projectile instead
    // of borrowing an unrelated weapon's effect.
    super({ visuals: { color: "#7d57c2" } });
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

  get attackSpeed() {
    return 3;
  }

  get weight(): number {
    return 2;
  }

  get itemName(): ItemName {
    return ItemName.EYE_OF_AYAK;
  }

  get isTwoHander(): boolean {
    return false;
  }

  get inventoryImage() {
    return InventImage;
  }

  get attackAnimationId() {
    // TODO: replace with the Eye of Ayak's exact casting sequence once known.
    return PlayerAnimationIndices.CastSpell;
  }

  protected override poweredSpellMaxHit(magicLevel: number) {
    return Math.floor(magicLevel / 3) - 6;
  }
}
