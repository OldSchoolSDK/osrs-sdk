import BladeOfSaeldorImage from "../../assets/images/weapons/Blade_of_saeldor.png";
import { AttackStyle, AttackStyleTypes } from "../../sdk/AttackStylesController";
import { ItemName } from "../../sdk/ItemName";
import { PlayerAnimationIndices } from "../../sdk/rendering/GLTFAnimationConstants";
import { Assets } from "../../sdk/utils/Assets";
import { Sound } from "../../sdk/utils/SoundCache";
import { MeleeWeapon } from "../../sdk/weapons/MeleeWeapon";

import { cacheSound } from "../../sdk/audio/CacheSoundEffects";
import { CACHE_ASSETS } from "../../assets/CacheAssets";

export class BladeOfSaeldor extends MeleeWeapon {
  get cacheItemId(): number { return CACHE_ASSETS.items.bladeOfSaeldor.id; }
  constructor() {
    super();

    this.bonuses = {
      attack: {
        stab: 55,
        slash: 100,
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
        meleeStrength: 93,
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
    return 1.814;
  }

  attackStyles() {
    return [AttackStyle.ACCURATE, AttackStyle.AGGRESSIVESLASH, AttackStyle.STAB, AttackStyle.DEFENSIVE];
  }

  attackStyleCategory(): AttackStyleTypes {
    return AttackStyleTypes.SLASHSWORD;
  }

  defaultStyle(): AttackStyle {
    return AttackStyle.AGGRESSIVESLASH;
  }

  get itemName(): ItemName {
    return ItemName.BLADE_OF_SAELDOR;
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
    return 4;
  }

  get inventoryImage() {
    return BladeOfSaeldorImage;
  }

  private Model = Assets.getAssetUrl("models/player_blade_of_saeldor.glb");
  override get model() {
    return this.Model;
  }

  override get attackAnimationId() {
    return PlayerAnimationIndices.SwordSlash;
  }

  override get idleAnimationId() {
    return PlayerAnimationIndices.Idle;
  }

  get attackSound() {
    return new Sound(cacheSound(CACHE_ASSETS.sounds.meleeAttack.id), 0.1);
  }
}
