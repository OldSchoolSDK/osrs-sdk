import InventImage from "../../assets/images/weapons/Tumekens_shadow.png";
import { PoweredStaff } from "../../sdk/weapons/PoweredStaff";
import { ItemName } from "../../sdk/ItemName";
import { CACHE_ASSETS } from "../../assets/CacheAssets";
import { cacheSound } from "../../sdk/audio/CacheSoundEffects";
import { Sound } from "../../sdk/utils/SoundCache";
import { PlayerAnimationIndices } from "../../sdk/rendering/GLTFAnimationConstants";

/** Tumeken's shadow's base item stats and powered-staff attack profile.
 *
 * The Shadow's equipment/passive multiplier is deliberately omitted. Its
 * built-in spell uses the unmodified powered-staff base hit formula here.
 */
export class TumekensShadow extends PoweredStaff {
  get cacheItemId(): number {
    return CACHE_ASSETS.items.tumekensShadow.id;
  }

  constructor() {
    super({
      visuals: {
        spotAnim: { id: CACHE_ASSETS.spotAnims.tumekensShadowProjectile.id },
        startCycleOffset: 30,
        verticalOffset: 2.0,
      },
    });
    this.bonuses = {
      attack: {
        stab: 0,
        slash: 0,
        crush: 0,
        magic: 35,
        range: 0,
      },
      defence: {
        stab: 0,
        slash: 0,
        crush: 0,
        magic: 20,
        range: 0,
      },
      other: {
        meleeStrength: 0,
        rangedStrength: 0,
        magicDamage: 0,
        prayer: 1,
      },
      targetSpecific: {
        undead: 0,
        slayer: 0,
      },
    };
  }

  get weight(): number {
    return 5;
  }

  get itemName(): ItemName {
    return ItemName.TUMEKENS_SHADOW;
  }

  get isTwoHander(): boolean {
    return true;
  }

  /** Accurate attacks reach 8 tiles and Longrange reaches 10. */
  protected override get baseAttackRange(): number {
    return 8;
  }

  get attackSpeed(): number {
    return 5;
  }

  get attackSound(): Sound {
    return new Sound(cacheSound(CACHE_ASSETS.sounds.tumekensShadowAttack.id), 0.1);
  }

  get inventoryImage() {
    return InventImage;
  }

  override get idleAnimationId() {
    return PlayerAnimationIndices.TumekensShadowIdle;
  }

  override get walkAnimationId() {
    return PlayerAnimationIndices.TumekensShadowWalk;
  }

  override get runAnimationId() {
    return PlayerAnimationIndices.TumekensShadowRun;
  }

  override get attackAnimationId() {
    return PlayerAnimationIndices.TumekensShadowAttack;
  }

  override get attackSpotAnim() {
    return { id: CACHE_ASSETS.spotAnims.tumekensShadowAttack.id };
  }

  protected override poweredSpellMaxHit(magicLevel: number): number {
    return Math.floor(magicLevel / 3 + 1);
  }
}
