import { Unit } from "../Unit";
import { BarrageSpell } from "./BarrageSpell";
import { ProjectileOptions } from "./Projectile";
import { AttackBonuses } from "../gear/Weapon";
import { ItemName } from "../ItemName";
import { Sound, SoundCache } from "../utils/SoundCache";
import BloodBarrageSound from "../../assets/sounds/blood_barrage.ogg"

export class BloodBarrageSpell extends BarrageSpell {
  constructor(projectileRules?: ProjectileOptions) {
    super(projectileRules);
    SoundCache.preload(this.attackSound.src);
  }
  
  override get attackSound() {
    return new Sound(BloodBarrageSound, 0.1);
  }

  get itemName(): ItemName {
    return ItemName.BLOOD_BARRAGE;
  }

  attack(from: Unit, to: Unit, bonuses: AttackBonuses = {}, options: ProjectileOptions = {}): boolean {
    super.attack(from, to, bonuses, options);
    if (from.currentStats.hitpoint < from.stats.hitpoint) {
      from.currentStats.hitpoint += Math.floor(this.damageRoll * 0.25);
      from.currentStats.hitpoint = Math.max(Math.min(from.stats.hitpoint, from.currentStats.hitpoint), 0);
    }
    return true;
  }
}
