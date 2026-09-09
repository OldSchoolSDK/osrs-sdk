"use strict";

import { Entity, CollisionType, LineOfSightMask, Model, CacheRenderSceneModel } from "../src";
import { SAMPLE_ASSETS } from "./assets";


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
    return new CacheRenderSceneModel(`region:${SAMPLE_ASSETS.regions.colosseum.id}`, { elevation: -7.5 });
  }
}
