import NoxiousHalberdImage from "../../assets/images/weapons/Noxious_halberd.png";
import ScytheAttackSound from "../../assets/sounds/scythe_swing_2524.ogg";
import { AttackStyle, AttackStyleTypes } from "../../sdk/AttackStylesController";
import { ItemName } from "../../sdk/ItemName";
import { PlayerAnimationIndices } from "../../sdk/rendering/GLTFAnimationConstants";
import { Assets } from "../../sdk/utils/Assets";
import { Sound } from "../../sdk/utils/SoundCache";
import { MeleeWeapon } from "../../sdk/weapons/MeleeWeapon";

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

  attackStyles() {
    return [AttackStyle.CONTROLLED,AttackStyle.AGGRESSIVESLASH, AttackStyle.DEFENSIVE];
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
    // it does but it's useless
    return false;
  }

  get attackRange() {
    return 2;
  }

  get attackSpeed() {
    return 5;
  }

  get inventoryImage() {
    return NoxiousHalberdImage;
  }

  private Model = Assets.getAssetUrl("models/player_noxious_halberd.glb");
  override get model() {
    return this.Model;
  }

  override get attackAnimationId() {
    return PlayerAnimationIndices.HalberdSlash;
  }

  override get idleAnimationId() {
    return PlayerAnimationIndices.HalberdIdle;
  }

  get attackSound() {
    // stab should use staff_stab.ogg
    return new Sound(ScytheAttackSound, 0.1);
  }
}