import { CollisionType } from "./Collision";
import { Entity } from "./Entity";
import { LineOfSightMask } from "./LineOfSight";
import { Location } from "./Location";
import { Region } from "./Region";
import { CacheRenderModel } from "./rendering/CacheRenderModel";
import { CacheRenderReferences } from "./rendering/CacheRenderReference";

export interface GraphicsObjectOptions {
  /** Vertical offset in SDK tile units. */
  height?: number;
  /** Delay before playback in 50 Hz client cycles. */
  delay?: number;
  /** Additional cache-angle rotation, where 2048 units is one turn. */
  rotation?: number;
  /** Optional mapping from cache HSL face colours to Three.js RGB values. */
  recolor?: Record<string, number>;
}

/**
 * A standalone, one-shot world instance of a cache spot-animation definition.
 *
 * This mirrors the client's GraphicsObject: the spotanim ID supplies its model,
 * sequence, scale, and cache rotation, while the spawn supplies world placement,
 * height, and delay. The entity removes itself when the sequence finishes.
 */
export class GraphicsObject extends Entity {
  private finished = false;

  constructor(
    region: Region,
    location: Location,
    readonly spotAnimId: number,
    private readonly options: GraphicsObjectOptions = {},
  ) {
    super(region, location);
  }

  override get collisionType() { return CollisionType.NONE; }
  override get lineOfSight() { return LineOfSightMask.NONE; }
  override get drawOutline() { return false; }
  override get color() { return "#ffffff"; }
  override shouldDestroy() { return this.finished; }

  override create3dModel() {
    return CacheRenderModel.forRenderable(
      this,
      CacheRenderReferences.spotAnim([{ id: this.spotAnimId, ...this.options }]),
      { onSpotAnimComplete: () => {
        this.finished = true;
        // Region cleanup removes entities whose dying counter reaches zero.
        this.dying = 0;
      } },
    );
  }

  // GraphicsObjects are cache-rendered effects and have no 2D fallback tile.
  override draw() {}
}
