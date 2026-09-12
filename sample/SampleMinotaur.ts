import {
  CacheRenderModel,
  CacheRenderReferences,
  MeleeWeapon,
  Mob,
  UnitBonuses,
} from "../src";
import { SAMPLE_ASSETS } from "./assets";

enum MinotaurAnimations {
  Idle = 0,
  Walk = 1,
  Attack = 3,
  Death = 6,
}

/** Colosseum Minotaur fixture used by the SDK sample scene. */
export class SampleMinotaur extends Mob {
  static readonly NPC_ID = SAMPLE_ASSETS.npcs.minotaur.id;

  override mobName() { return "Minotaur"; }
  override get combatLevel() { return 318; }
  override get attackSpeed() { return 5; }
  override get attackRange() { return 1; }
  override get size() { return 3; }
  override get deathAnimationLength() { return 4; }

  override setStats() {
    this.weapons = { crush: new MeleeWeapon({ setDelay: 2 }) };
    this.stats = {
      attack: 300,
      strength: 360,
      defence: 190,
      range: 120,
      magic: 250,
      hitpoint: 225,
    };
    this.currentStats = JSON.parse(JSON.stringify(this.stats));
  }

  override get bonuses(): UnitBonuses {
    return {
      attack: { stab: 0, slash: 0, crush: 15, magic: 0, range: 0 },
      defence: { stab: 0, slash: 0, crush: 0, magic: 0, range: 12 },
      other: { meleeStrength: 64, rangedStrength: 0, magicDamage: 1, prayer: 0 },
    };
  }

  override attackStyleForNewAttack() { return "crush"; }
  override get idlePoseId() { return MinotaurAnimations.Idle; }
  override get walkingPoseId() { return MinotaurAnimations.Walk; }
  override get attackAnimationId() { return MinotaurAnimations.Attack; }
  override get deathAnimationId() { return MinotaurAnimations.Death; }

  override create3dModel() {
    return CacheRenderModel.forRenderable(this, CacheRenderReferences.npc(SampleMinotaur.NPC_ID));
  }
}
