import { DelayedAction } from "../../sdk/DelayedAction";
import { Mob } from "../../sdk/Mob";
import { UILayerProjector } from "../../sdk/Renderable";
import { UnitBonuses } from "../../sdk/Unit";
import { CacheRenderModel } from "../../sdk/rendering/CacheRenderModel";
import { CacheRenderReferences } from "../../sdk/rendering/CacheRenderReference";
import { Model } from "../../sdk/rendering/Model";
import { MagicWeapon } from "../../sdk/weapons/MagicWeapon";
import { MeleeWeapon } from "../../sdk/weapons/MeleeWeapon";
import { RangedWeapon } from "../../sdk/weapons/RangedWeapon";


/** Semantic pose indices mapped to the cache sequences extracted for NPC 12818. */
export enum ManticoreAnimations {
  Idle = 0,
  Walk = 1,
  TripleCharge = 2,
  TripleThrow = 3,
  Death = 4,
}

enum Orbs {
  Range,
  Mage,
  Melee
};

const ORB_TO_SPOTANIM = {
  [Orbs.Range]: 2683,
  [Orbs.Mage]: 2681,
  [Orbs.Melee]: 2685,
};

const ORB_HEIGHT_1 = 7;
const ORB_HEIGHT_2 = 9;
const ORB_HEIGHT_3 = 11;
const PROJECTILE_FLIGHT_CLIENT_CYCLES = 30;

/**
 * The Fortis Colosseum manticore (NPC definition 12818).
 *
 * This is a reference implementation of the Manticore's combat and visuals.
 * Consumers are responsible for declaring NPC 12818, its sequences, and the
 * three orb spotanims in their own cache asset manifest.
 */
export class Manticore extends Mob {
  static readonly NPC_ID = 12818;

  private attackStyles: Orbs[] | null = null;

  private hasAttacked = false;

  override mobName() {
    return "Manticore";
  }

  override get combatLevel() {
    return 320;
  }

  override setStats() {
    this.weapons = {
      crush: new MeleeWeapon({ visuals: { hidden: false } }),
      range: new RangedWeapon(),
      magic: new MagicWeapon(),
    };

    this.stats = {
      attack: 300,
      strength: 300,
      defence: 250,
      range: 350,
      magic: 300,
      hitpoint: 250,
    };
    this.currentStats = JSON.parse(JSON.stringify(this.stats));
  }

  override get bonuses(): UnitBonuses {
    return {
      attack: {
        stab: 0,
        slash: 0,
        crush: 0,
        magic: 0,
        range: 0,
      },
      defence: {
        stab: 0,
        slash: 0,
        crush: 0,
        magic: 10,
        range: 25,
      },
      other: {
        meleeStrength: 0,
        rangedStrength: 0,
        // The SDK represents the NPC's unmodified magic damage multiplier as 1.
        magicDamage: 1,
        prayer: 0,
      },
    };
  }

  override get attackSpeed() {
    return 10;
  }

  override get attackRange() {
    return 15;
  }

  override get size() {
    return 3;
  }

  override get flinchDelay() {
    return 0;
  }

  override attackStyleForNewAttack() {
    // not used
    return "range";
  }

  override attack() {
    if (!this.attackStyles) {
      this.selectAttackStyle();
      this.attackDelay = 10;
      return false;
    }
    return true;
  }

  override didAttack() {
    if (!this.attackStyles) {
      // shouldn't happen
      return;
    }
    // override default behaviour
    this.attackDelay = 10;
    this.playAnimation(ManticoreAnimations.TripleThrow);
    // The first projectile is launched on the attack tick.
    this.fireProjectile(0);
    this.clearSpotAnim("first-orb");
    DelayedAction.registerDelayedNpcAction(new DelayedAction(() => {
      this.fireProjectile(1);
      this.clearSpotAnim("second-orb");
    }, 1));
    DelayedAction.registerDelayedNpcAction(new DelayedAction(() => {
      this.fireProjectile(2);
      this.clearSpotAnim("third-orb");
    }, 2));
    this.hasAttacked = true;
  }

  private selectAttackStyle(): Orbs[] {
    if (this.attackStyles) {
      return this.attackStyles;
    }
    // TODO: choose based on other mantis
    this.attackStyles = [];
    // TODO: mantimayhem
    // 50% chance of range or mage first
    const firstStyle = Math.random() < 0.5 ? Orbs.Range : Orbs.Mage;
    this.attackStyles.push(firstStyle);
    if (firstStyle === Orbs.Range) {
      this.attackStyles.push(Orbs.Mage, Orbs.Melee);
    } else {
      this.attackStyles.push(Orbs.Range, Orbs.Melee);
    }
    return this.attackStyles;
  }

  override attackStep() {
    super.attackStep();
    if (this.attackStyles?.length === 3) {
      if (this.attackDelay === 6) {
        this.playAnimation(ManticoreAnimations.TripleCharge);
      }
      if (this.attackDelay <= 5) {
        this.playChargedOrb(0, ORB_HEIGHT_1, "first-orb");
      }
      if (this.attackDelay <= 4 || (this.hasAttacked && this.attackDelay >= 10)) {
        this.playChargedOrb(1, ORB_HEIGHT_2, "second-orb");
      }
      if (this.attackDelay <= 3 || (this.hasAttacked && this.attackDelay >= 9)) {
        this.playChargedOrb(2, ORB_HEIGHT_3, "third-orb");
      }
    }
  }

  /** Show the coloured orb charging above the Manticore's head. */
  private playChargedOrb(index: number, height: number, channel: string) {
    const orb = this.attackStyles?.[index];
    if (orb === undefined) return;
    this.addSpotAnim({ id: ORB_TO_SPOTANIM[orb], channel, height });
  }

  /** Launch the coloured orb as a projectile. */
  private fireProjectile(index: number) {
    if (!this.attackStyles) {
      return;
    }
    const orb = this.attackStyles[index];
    const target = this.aggro;
    if (orb === undefined || !target) return;

    const spotAnimId = ORB_TO_SPOTANIM[orb];
    const attackStyle = orb === Orbs.Range ? "range" : orb === Orbs.Mage ? "magic" : "crush";
    const weapon = this.weapons[attackStyle];
    weapon.attack(
      this,
      target,
      {
        attackStyle,
        magicBaseSpellDamage: attackStyle === "magic" ? this.magicMaxHit() : undefined,
      },
      {
        // Projectiles added during attackStep are processed once immediately
        // by World.tickRegion, so delay 2 means one full tick after spawning.
        setDelay: 2,
        visuals: {
          spotAnim: { id: spotAnimId },
          // Every orb visually reaches its target one game tick after launch,
          // regardless of the distance-derived combat hit delay.
          endCycleOffset: PROJECTILE_FLIGHT_CLIENT_CYCLES,
        },
      },
    );
  }

  override get idlePoseId() {
    return ManticoreAnimations.Idle;
  }

  override get walkingPoseId() {
    return ManticoreAnimations.Walk;
  }

  /** Semantic index for the charge-up phase of the triple attack. */
  get tripleChargeAnimationId() {
    return ManticoreAnimations.TripleCharge;
  }

  /** Semantic index for the projectile throw phase of the triple attack. */
  get tripleThrowAnimationId() {
    return ManticoreAnimations.TripleThrow;
  }

  override get deathAnimationId() {
    return ManticoreAnimations.Death;
  }

  override canMeleeIfClose() {
    return "crush" as const;
  }

  override magicMaxHit() {
    return 31;
  }

  /** Highest of the manticore's three style max hits (ranged). */
  override get maxHit() {
    return 36;
  }

  override create3dModel(): Model {
    return CacheRenderModel.forRenderable(this, CacheRenderReferences.npc(Manticore.NPC_ID));
  }

    override drawUILayer(
      tickPercent: number,
      projector: UILayerProjector,
      context: OffscreenCanvasRenderingContext2D,
      scale: number,
    ) {
      super.drawUILayer(tickPercent, projector, context, scale);
  
      // draw attack delay
      const hitsplatPosition = projector.atHeight(projector.logicalHeight * 0.5);
      context.save();
      context.translate(hitsplatPosition.x, hitsplatPosition.y);
      context.font = "18px Stats_11";
      context.textAlign = "center";
      context.lineWidth = 3;
      context.strokeStyle = "#000000";
      context.strokeText(String(this.attackDelay), 0, 42);
      context.fillStyle = "#FFFF00";
      context.fillText(String(this.attackDelay), 0, 42);
      context.restore();
    }
  
}
