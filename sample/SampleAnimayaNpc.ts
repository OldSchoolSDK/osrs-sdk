import { BasicModel, CacheRender, CacheRenderModel, CacheRenderReferences, FallbackModel, Location, Mob, Region, UnitOptions } from "../src";

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
