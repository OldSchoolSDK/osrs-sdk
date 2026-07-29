import InventoryImage from "../../assets/images/weapons/Noxious_halberd.png";
import { AttackStyle, AttackStyleTypes } from "../../sdk/AttackStylesController";
import { ItemName } from "../../sdk/ItemName";
import { PlayerAnimationIndices } from "../../sdk/rendering/GLTFAnimationConstants";
import { Assets } from "../../sdk/utils/Assets";
import { Sound } from "../../sdk/utils/SoundCache";
import { MeleeWeapon } from "../../sdk/weapons/MeleeWeapon";

import ScytheAttackSound from "../../assets/sounds/scythe_swing_2524.ogg";

export class NoxiousHalberd extends MeleeWeapon {
  constructor() {
    super();

    this.bonuses = {
      attack: {
        stab: 80,
        slash: 132,
        crush: 0,
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
        meleeStrength: 142,
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
    return [AttackStyle.STAB, AttackStyle.AGGRESSIVESLASH, AttackStyle.DEFENSIVE];
  }

  attackStyleCategory(): AttackStyleTypes {
    return AttackStyleTypes.POLEARM;
  }

  defaultStyle(): AttackStyle {
    return AttackStyle.AGGRESSIVESLASH;
  }

  get itemName(): ItemName {
    return ItemName.NOXIOUS_HALBERD;
  }

  get isTwoHander(): boolean {
    return true;
  }

  hasSpecialAttack(): boolean {
    return true;
  }

  get attackRange() {
    return 2;
  }

  get attackSpeed() {
    return 5;
  }

  get inventoryImage() {
    return InventoryImage;
  }

  override get model() {
    return Assets.getAssetUrl("models/player_noxious_halberd.glb");
  }

  override get attackAnimationId() {
    return PlayerAnimationIndices.ScytheSwing;
  }

  override get idleAnimationId() {
    return PlayerAnimationIndices.ScytheIdle;
  }

  get attackSound() {
    return new Sound(ScytheAttackSound, 0.1);
  }
}
