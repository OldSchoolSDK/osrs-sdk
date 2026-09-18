import { CacheRenderModel, CacheRenderReferences, CollisionType, Entity, LineOfSightMask, Region, Location } from "../src";
import { SAMPLE_ASSETS } from "./assets";

/** Static pillar object based on InfernoTrainer's pillar entity. */
export class SamplePillar extends Entity {
  constructor(region: Region, location: Location, private isVisible = true) {
    super(region, location);
  }

  override entityName() {
    return "Sample Pillar";
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

  override getPerceivedRotation() {
    return 0;
  }

  override get drawOutline(): boolean {
    return false;
  }

  override get collisionType() {
    return CollisionType.BLOCK_MOVEMENT;
  }

  override get lineOfSight(): LineOfSightMask {
    return LineOfSightMask.FULL_MASK;
  }

  override visible(tickPercent: number) {
    return this.isVisible;
  }

  override create3dModel() {
    return CacheRenderModel.forRenderable(this, CacheRenderReferences.model(SAMPLE_ASSETS.models.infernoPillar.id));
  }
}
