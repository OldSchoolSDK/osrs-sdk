import { BasicModel, CacheRender, CacheRenderModel, CacheRenderReferences, CollisionType, Entity, FallbackModel, LineOfSightMask, Location, Region } from "../src";
import { CACHE_ASSETS } from "../src/assets/CacheAssets";

/** Static pillar object based on InfernoTrainer's pillar entity. */
export class SampleDummy extends Entity {

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

  override get collisionType() {
    return CollisionType.BLOCK_MOVEMENT;
  }

  override get lineOfSight(): LineOfSightMask {
    return LineOfSightMask.FULL_MASK;
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
