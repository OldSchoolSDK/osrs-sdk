import InventImage from "../../assets/images/weapons/Venator_bow.png";
import { RangedWeapon } from "../../sdk/weapons/RangedWeapon";
import { ItemName } from "../../sdk/ItemName";
import { AttackStyle, AttackStyleTypes } from "../../sdk/AttackStylesController";
import { PlayerAnimationIndices } from "../../sdk/rendering/GLTFAnimationConstants";
import { CACHE_ASSETS } from "../../assets/CacheAssets";
import { cacheSound } from "../../sdk/audio/CacheSoundEffects";
import { Sound } from "../../sdk/utils/SoundCache";

/** Raw charged venator bow stats and ordinary bow combat profile.
 *
 * The charged bow's accuracy/passive ricochet effects are intentionally not
 * modelled; this behaves as a regular bow firing compatible arrows.
 */
export class VenatorBow extends RangedWeapon {
  get cacheItemId(): number {
    return CACHE_ASSETS.items.venatorBow.id;
  }

  constructor() {
    super({
      visuals: {
        spotAnim: { id: CACHE_ASSETS.spotAnims.venatorBowProjectile.id },
      },
    });
    this.bonuses = {
      attack: {
        stab: 0,
        slash: 0,
        crush: 0,
        magic: 0,
        range: 90,
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
        rangedStrength: 25,
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
    return [ItemName.DRAGON_ARROWS];
  }

  attackStyles() {
    return [AttackStyle.ACCURATE, AttackStyle.RAPID, AttackStyle.LONGRANGE];
  }

  attackStyleCategory(): AttackStyleTypes {
    return AttackStyleTypes.BOW;
  }

  defaultStyle(): AttackStyle {
    return AttackStyle.RAPID;
  }

  get attackSpeed(): number {
    return this.attackStyle() === AttackStyle.RAPID ? 4 : 5;
  }

  get attackSound(): Sound {
    return new Sound(cacheSound(CACHE_ASSETS.sounds.venatorBowAttack.id), 0.1);
  }

  get attackRange(): number {
    return this.attackStyle() === AttackStyle.LONGRANGE ? 8 : 6;
  }

  get weight(): number {
    return 4.5;
  }

  get itemName(): ItemName {
    return ItemName.VENATOR_BOW;
  }

  get isTwoHander(): boolean {
    return true;
  }

  get inventoryImage() {
    return InventImage;
  }

  get attackAnimationId() {
    return PlayerAnimationIndices.VenatorBowAttack;
  }

  override get idleAnimationId() {
    return PlayerAnimationIndices.VenatorBowIdle;
  }

  override get walkAnimationId() {
    return PlayerAnimationIndices.VenatorBowWalk;
  }

  override get runAnimationId() {
    return PlayerAnimationIndices.VenatorBowRun;
  }

  override get attackSpotAnim() {
    return { id: CACHE_ASSETS.spotAnims.venatorBowAttack.id };
  }
}
