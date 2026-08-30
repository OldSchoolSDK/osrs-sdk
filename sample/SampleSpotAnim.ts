import { CacheRenderInstancedModel, CacheRenderReferences, CollisionType, Entity, LineOfSightMask, Location, Region } from "../src";

/** A short-lived cache spotanim instance used by the SDK sample. */
export class SampleSpotAnim extends Entity {
  private age = 0;

  constructor(
    region: Region,
    location: Location,
    private readonly rotation: number,
    private readonly delay = 0,
  ) {
    super(region, location);
  }

  override get size() { return 1; }
  override get color() { return "#ffffff"; }
  override get drawOutline() { return false; }
  override get collisionType() { return CollisionType.NONE; }
  override get lineOfSight() { return LineOfSightMask.NONE; }

  override create3dModel() {
    return CacheRenderInstancedModel.forRenderable(this, CacheRenderReferences.spotAnim([{
      id: 2669,
      delay: this.delay,
      rotation: this.rotation,
      height: 0,
    }]));
  }

  override visible() { return true; }

  tick() {
    this.age++;
    if (this.age >= 2) this.dying = 0;
  }
}
