import InventoryImage from "../../assets/images/weapons/Abyssal_tentacle.png";
import { AttackStyle, AttackStyleTypes } from "../../sdk/AttackStylesController";
import { ItemName } from "../../sdk/ItemName";
import { PlayerAnimationIndices } from "../../sdk/rendering/GLTFAnimationConstants";
import { Assets } from "../../sdk/utils/Assets";
import { Sound } from "../../sdk/utils/SoundCache";
import { MeleeWeapon } from "../../sdk/weapons/MeleeWeapon";

import { cacheSound } from "../../sdk/audio/CacheSoundEffects";
import { CACHE_ASSETS } from "../../assets/CacheAssets";

export class AbyssalTentacle extends MeleeWeapon {
  override get equipSoundId(): number {
    return CACHE_ASSETS.sounds.equipWhip.id;
  }

  get cacheItemId(): number {
    return CACHE_ASSETS.items.abyssalTentacle.id;
  }

  constructor() {
    super();

    this.bonuses = {
      attack: {
        stab: 0,
        slash: 90,
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
        meleeStrength: 86,
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
    return 0.453;
  }

  attackStyles() {
    return [AttackStyle.ACCURATE, AttackStyle.CONTROLLED, AttackStyle.DEFENSIVE];
  }

  attackStyleCategory(): AttackStyleTypes {
    return AttackStyleTypes.SLASHSWORD;
  }

  defaultStyle(): AttackStyle {
    return AttackStyle.CONTROLLED;
  }

  get itemName(): ItemName {
    return ItemName.ABYSSAL_TENTACLE;
  }

  get isTwoHander(): boolean {
    return false;
  }

  hasSpecialAttack(): boolean {
    return true;
  }

  get attackRange() {
    return 1;
  }

  get attackSpeed() {
    return 4;
  }

  get inventoryImage() {
    return InventoryImage;
  }

  private Model = Assets.getAssetUrl("models/player_abyssal_tentacle.glb");
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
