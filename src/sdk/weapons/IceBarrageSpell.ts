import type { Unit } from "../Unit";
import { BarrageSpell } from "./BarrageSpell";
import { ProjectileOptions } from "./Projectile";
import { AttackBonuses } from "../gear/Weapon";
import { ItemName } from "../ItemName";
import { Sound, SoundCache } from "../utils/SoundCache";
import IceBarrageSound from "../../assets/sounds/ice_barrage.ogg"

export class IceBarrageSpell extends BarrageSpell {
  constructor(projectileRules?: ProjectileOptions) {
    super(projectileRules);
    SoundCache.preload(this.attackSound.src);
  }
  
  override get attackSound() {
    return new Sound(IceBarrageSound, 0.1);
  }

  get itemName(): ItemName {
    return ItemName.ICE_BARRAGE;
  }

  attack(from: Unit, to: Unit, bonuses: AttackBonuses = {}, options: ProjectileOptions = {}): boolean {
    super.attack(from, to, bonuses, options);
    if (this.lastHitHit) {
      to.freeze(32);
    }
    return true;
  }
}
