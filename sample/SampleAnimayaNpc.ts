import {
  BasicModel,
  CacheRender,
  CacheRenderModel,
  CacheRenderReferences,
  DelayedAction,
  FallbackModel,
  Location,
  Mob,
  Projectile,
  Region,
  Settings,
  UILayerProjector,
  UnitOptions,
} from "../src";
import { CACHE_ASSETS } from "../src/assets/CacheAssets";
import { SampleSpotAnim } from "./SampleSpotAnim";

const TRIPLE_ATTACK_SHORT = 6; // Cache sequence 10887.
const TRIPLE_ATTACK_TICKS = 11;
const TRIPLE_HITS = new Map([
  [3, 15],
  [6, 25],
  [9, 35],
]);

const SPEAR_ATTACK = 2; // Cache asset pose "attack" (sequence 10883).
const SPEAR_ATTACK_TICKS = 6; // Sequence 10883 is 180 client frames.
const SPEAR_HITS = new Map([
  [4, 35],
]);

// Keep the triple-attack fixture above available while using the spear attack
// as the active timing fixture for sound comparison.
const ACTIVE_SOL_ATTACK = {
  animation: SPEAR_ATTACK,
  ticks: SPEAR_ATTACK_TICKS,
  hits: SPEAR_HITS,
};
const SOL_FRAME_SOUND_DELAY_MS = 240;

/** Sol Heredit fixture used to exercise skeleton-based Animaya rendering. */
export class SampleAnimayaNpc extends Mob {
  private attackTick = 0;

  constructor(region: Region, location: Location, options: UnitOptions = {}) {
    super(region, location, options);
    this.autoRetaliate = false;
  }

  override mobName() { return "Sol Heredit (Animaya)"; }
  override get size() { return 5; }
  override get height() { return 6; }
  override canAttack() { return false; }

  override timerStep() {
    if (this.attackTick === 0) {
      this.currentStats.hitpoint = this.stats.hitpoint;
      this.playAnimation(ACTIVE_SOL_ATTACK.animation);
      DelayedAction.registerDelayedAction(
        new DelayedAction(() => this.spawnDamageDustClouds(), 3),
      );
    }

    const damage = ACTIVE_SOL_ATTACK.hits.get(this.attackTick);
    if (damage !== undefined) {
      // timerStep runs immediately before incoming attacks are processed, so
      // this one-tick hidden projectile creates the hitsplat on this boundary.
      this.addProjectile(new Projectile(null, damage, this, this, "stab", {
        hidden: true,
        setDelay: 1,
      }));
    }

    this.attackTick = (this.attackTick + 1) % ACTIVE_SOL_ATTACK.ticks;
  }

  override drawUILayer(
    tickPercent: number,
    projector: UILayerProjector,
    context: OffscreenCanvasRenderingContext2D,
    scale: number,
  ) {
    super.drawUILayer(tickPercent, projector, context, scale);

    const tickProgressMs = Math.round(tickPercent * Settings.tickMs);
    const hitsplatPosition = projector.atHeight(projector.logicalHeight * 0.5);
    context.save();
    context.translate(hitsplatPosition.x, hitsplatPosition.y);
    if (Settings.rotated === "south") context.rotate(Math.PI);
    context.font = "18px Stats_11";
    context.textAlign = "center";
    context.lineWidth = 3;
    context.strokeStyle = "#000000";
    context.strokeText(String(tickProgressMs), 0, 42);
    context.fillStyle = "#FFFF00";
    context.fillText(String(tickProgressMs), 0, 42);
    context.restore();
  }

  override damageTaken() {
    // Keep the looping timing fixture readable. Player-originated hits still
    // exercise the radial spotanim burst below.
    const isLoopingSelfHit = this.incomingProjectiles.some(
      (projectile) => projectile.from === this && projectile.remainingDelay === 0,
    );
    if (isLoopingSelfHit) return;

    this.spawnDamageDustClouds();
  }

  private spawnDamageDustClouds() {
    // Demonstrate a radial burst of cache-derived spotanims whenever the
    // sample Sol receives a hit. Each instance shares the same animation but
    // is rotated toward the outside of the arena.
    if (!CacheRender.isConfigured()) return;
    const centreX = this.location.x + this.size / 2;
    const centreY = this.location.y - this.size / 2;
    // Four rings of sixteen effects deliberately stress-test short-lived
    // spotanim creation and rendering (64 instances per hit).
    for (let ring = 1; ring <= 4; ring++) {
      for (let direction = 0; direction < 16; direction++) {
        const angle = direction * Math.PI / 8;
        const x = Math.round(centreX + Math.cos(angle) * (2 + ring));
        const y = Math.round(centreY + Math.sin(angle) * (2 + ring));
        const rotation = angle * 1024 / (Math.PI * 2);
        this.region.addEntity(new SampleSpotAnim(this.region, { x, y }, rotation, ring * 2));
      }
    }
  }

  override setStats() {
    this.weapons = {};
    this.stats = { attack: 0, strength: 0, defence: 100, range: 0, magic: 0, hitpoint: 10000 };
    this.currentStats = JSON.parse(JSON.stringify(this.stats));
  }

  override create3dModel() {
    if (CacheRender.isConfigured()) {
      return new FallbackModel(
        CacheRenderModel.forRenderable(
          this,
          CacheRenderReferences.npc(CACHE_ASSETS.npcs.solHeredit.id),
          { frameSoundDelayMs: SOL_FRAME_SOUND_DELAY_MS },
        ),
        BasicModel.forRenderable(this),
      );
    }
    return BasicModel.forRenderable(this);
  }
}
