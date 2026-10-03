import * as THREE from "three";

import { Location3 } from "../Location";

export interface Model {
  draw(
    scene: THREE.Scene,
    clockDelta: number,
    tickPercent: number,
    location: Location3,
    angleRadians: number,
    pitchRadians: number,
    visible: boolean,
    modelOffsets: Location3[],
  );

  destroy(scene: THREE.Scene);

  getWorldPosition(): THREE.Vector3;

  /** Current posed height above the model origin, when available. */
  getLogicalHeight?(): number | null;

  /** Current animated model vertices in world space. */
  getClickboxVertices?(): THREE.Vector3[];

  /**
   * Conservative world bounds of those vertices. Used for early filtering to avoid computing expensive clickbox bounds unless
   * the mouse is near the model.
  */
  getClickboxBounds?(): THREE.Box3 | null;

  /** Triangle indices into getClickboxVertices(), excluding client-hidden faces. */
  getClickboxTriangles?(): ArrayLike<number>;

  preload(): Promise<void>;
}
