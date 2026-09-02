import { BasicModel, CacheRender, CacheRenderModel, CacheRenderReferences, FallbackModel, Location, Mob, Region, UnitOptions } from "../src";
import { CACHE_ASSETS } from "../src/assets/CacheAssets";

/** Passive target dummy based on InfernoTrainer's pillar entity. */
export class SampleDummy extends Mob {
  constructor(region: Region, location: Location, options: UnitOptions = {}) {
    super(region, location, options);
    this.autoRetaliate = false;
  }

  override mobName() {
    return "Training Dummy";
  }

  override setStats() {
    this.weapons = {};
    this.stats = {
      attack: 0,
      strength: 0,
      defence: 0,
      range: 0,
      magic: 0,
      hitpoint: 10000,
    };
    this.currentStats = JSON.parse(JSON.stringify(this.stats));
  }

  override get size() {
    return 3;
  }

  override get height() {
    return 6;
  }

  override get color() {
    return "#333333";
  }

  override canAttack() {
    return false;
  }

  override getPerceivedRotation(_tickPercent: number) {
    return 0;
  }

  override create3dModel() {
    if (CacheRender.isConfigured()) {
      return new FallbackModel(
        // it's an inferno pillar
        CacheRenderModel.forRenderable(this, CacheRenderReferences.model(CACHE_ASSETS.models.infernoPillar.id)),
        BasicModel.forRenderable(this),
      );
    }
    return BasicModel.forRenderable(this);
  }
}
