import { BasicModel, CacheRender, CacheRenderModel, CacheRenderReferences, FallbackModel, Location, Mob, Region, UnitOptions } from "../src";
import { SampleSpotAnim } from "./SampleSpotAnim";

/** Sol Heredit fixture used to exercise skeleton-based Animaya rendering. */
export class SampleAnimayaNpc extends Mob {
  constructor(region: Region, location: Location, options: UnitOptions = {}) {
    super(region, location, options);
    this.autoRetaliate = false;
  }

  override mobName() { return "Sol Heredit (Animaya)"; }
  override get size() { return 5; }
  override get height() { return 6; }
  override canAttack() { return false; }

  override damageTaken() {
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
        CacheRenderModel.forRenderable(this, CacheRenderReferences.npc(12821)),
        BasicModel.forRenderable(this),
      );
    }
    return BasicModel.forRenderable(this);
  }
}
