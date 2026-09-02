"use strict";

import { Assets, Entity, CollisionType, LineOfSightMask, Model, GLTFModel, CacheRenderSceneModel } from "../src";
import { CACHE_ASSETS } from "../src/assets/CacheAssets";


// note: v1 has the rocks where zuk should be - we could use that in the future
export const SampleSceneModel = Assets.getAssetUrl("models/scene-v3.glb");
// Cache composition is the normal scene path. Keep the old asset available
// only as an explicit visual-regression baseline; never draw both scenes.
const useStaticScene = new URLSearchParams(window.location.search).get("static-scene") === "1";

export class SampleScene extends Entity {
  get collisionType() {
    return CollisionType.NONE;
  }

  get size() {
    return 1;
  }

  draw() {
    // force empty draw
  }

  get color() {
    return "#222222";
  }

  get lineOfSight() {
    return LineOfSightMask.NONE;
  }

  getPerceivedRotation() {
    return -Math.PI / 2;
  }

  create3dModel(): Model {
    if (!useStaticScene) return new CacheRenderSceneModel(`region:${CACHE_ASSETS.regions.inferno.id}`);
    return new GLTFModel(this, [SampleSceneModel], { scale: 1, verticalOffset: -2.5, originOffset: {
      x: -6.5,
      y: 12.5,
    }});
  }
}
