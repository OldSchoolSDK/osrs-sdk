import { AttackStyle, AttackStyleTypes } from "../AttackStylesController";
import { CACHE_ASSETS } from "../../assets/CacheAssets";
import { Unit, UnitTypes } from "../Unit";
import { XpDrop } from "../XpDrop";
import type { AttackBonuses } from "../gear/Weapon";
import type { ProjectileOptions } from "./Projectile";
import { MagicWeapon } from "./MagicWeapon";

/** Shared combat behaviour for weapons with a built-in powered spell. */
export abstract class PoweredStaff extends MagicWeapon {
  override get equipSoundId() {
    return CACHE_ASSETS.sounds.equipStaff.id;
  }

  override attackStyles() {
    return [AttackStyle.ACCURATE, AttackStyle.LONGRANGE];
  }

  override attackStyleCategory() {
    return AttackStyleTypes.POWEREDSTAFF;
  }

  override defaultStyle() {
    return AttackStyle.LONGRANGE;
  }

  protected abstract poweredSpellMaxHit(magicLevel: number): number;

  protected get baseAttackRange() {
    return 6;
  }

  override get attackRange() {
    return this.baseAttackRange + (this.attackStyle() === AttackStyle.LONGRANGE ? 2 : 0);
  }

  override attack(from: Unit, to: Unit, bonuses: AttackBonuses = {}, options: ProjectileOptions = {}) {
    bonuses.attackStyle = "magic";
    bonuses.isAccurate = this.attackStyle() === AttackStyle.ACCURATE;
    return super.attack(from, to, bonuses, options);
  }

  override _baseSpellDamage(from: Unit) {
    return Math.max(0, this.poweredSpellMaxHit(from.currentStats.magic));
  }

  override grantXp(from: Unit, to: Unit) {
    if (from.type !== UnitTypes.PLAYER || this.damage <= 0) return;
    const multiplier = to.xpBonusMultiplier;
    from.grantXp(new XpDrop("magic", this.damage * 2 * multiplier, this.damage));
    if (this.attackStyle() === AttackStyle.LONGRANGE) {
      from.grantXp(new XpDrop("defence", this.damage * 2 * multiplier, this.damage));
    }
    from.grantXp(new XpDrop("hitpoint", this.damage * 1.33 * multiplier, this.damage));
  }
}
