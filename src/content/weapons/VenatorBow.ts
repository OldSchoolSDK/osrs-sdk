import InventImage from "../../assets/images/weapons/Venator_bow.png";
import { RangedWeapon } from "../../sdk/weapons/RangedWeapon";
import { ItemName } from "../../sdk/ItemName";
import { AttackStyle, AttackStyleTypes } from "../../sdk/AttackStylesController";
import { PlayerAnimationIndices } from "../../sdk/rendering/GLTFAnimationConstants";
import { CACHE_ASSETS } from "../../assets/CacheAssets";
import { cacheSound } from "../../sdk/audio/CacheSoundEffects";
import { Sound } from "../../sdk/utils/SoundCache";
import { AttackBonuses } from "../../sdk/gear/Weapon";
import { Unit } from "../../sdk/Unit";
import { mergeProjectileOptions, Projectile, ProjectileOptions } from "../../sdk/weapons/Projectile";
import { Mob } from "../../sdk/Mob";
import { getNextVenatorBounceTarget } from "./VenatorBounce";

const PRIMARY_END_CYCLE = 15;
const FIRST_BOUNCE_END_CYCLE = 30;
const SECOND_BOUNCE_END_CYCLE = 45;
const BOUNCE_DAMAGE_MULTIPLIER = 0.66;

/** Charged Venator bow, including its two-target ricochet passive. */
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

  override attack(from: Unit, to: Unit, bonuses: AttackBonuses = {}, options: ProjectileOptions = {}): boolean {
    const didAttack = super.attack(from, to, bonuses, mergeProjectileOptions(options, {
      setDelay: 1,
      visuals: { endCycleOffset: PRIMARY_END_CYCLE },
    }));
    if (!didAttack || !(to instanceof Mob)) return didAttack;

    const firstBounce = getNextVenatorBounceTarget(to);
    if (!firstBounce) return didAttack;
    this.queueBounce(
      from,
      to,
      firstBounce,
      bonuses,
      options,
      1,
      PRIMARY_END_CYCLE,
      FIRST_BOUNCE_END_CYCLE,
      CACHE_ASSETS.sounds.venatorBowRicochetFirst.id,
    );

    const secondBounce = getNextVenatorBounceTarget(firstBounce);
    if (secondBounce) {
      this.queueBounce(
        from,
        firstBounce,
        secondBounce,
        bonuses,
        options,
        2,
        FIRST_BOUNCE_END_CYCLE,
        SECOND_BOUNCE_END_CYCLE,
        CACHE_ASSETS.sounds.venatorBowRicochetSecond.id,
      );
    }
    return didAttack;
  }

  private queueBounce(
    attacker: Unit,
    visualSource: Mob,
    target: Mob,
    primaryBonuses: AttackBonuses,
    primaryOptions: ProjectileOptions,
    damageDelay: number,
    startCycleOffset: number,
    endCycleOffset: number,
    soundId: number,
  ) {
    const visualProjectile = new Projectile(this, 0, visualSource, target, "range", {
      visuals: {
        spotAnim: { id: CACHE_ASSETS.spotAnims.venatorBowRicochetProjectile.id },
        startCycleOffset,
        endCycleOffset,
      },
    });
    visualSource.region.addProjectileGraphic(visualProjectile.graphic);

    super.attack(
      attacker,
      target,
      {
        ...primaryBonuses,
        overallMultiplier: (primaryBonuses.overallMultiplier ?? 1) * BOUNCE_DAMAGE_MULTIPLIER,
      },
      mergeProjectileOptions(primaryOptions, {
        setDelay: damageDelay,
        sound: new Sound(cacheSound(soundId), 0.1),
        visuals: { hidden: true },
      }),
    );
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
