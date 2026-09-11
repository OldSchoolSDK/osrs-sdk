import * as THREE from "three";
import { Model } from "./Model";
import { Renderable } from "../Renderable";
import { Location3 } from "../Location";
import { createTileIndicator, GROUND_OVERLAY_Y, GroundOverlayRenderOrder } from "./RenderUtils";

export class TileMarkerModel implements Model {
  static forRenderable(r: Renderable, renderOrder: number | null = GroundOverlayRenderOrder.MARKED_TILE) {
    return new TileMarkerModel(r, renderOrder);
  }

  private outline: THREE.Mesh;
  private material: THREE.MeshBasicMaterial;

  constructor(private renderable: Renderable, renderOrder: number | null) {
    const { size } = renderable;
    this.outline = createTileIndicator(size, renderable.colorHex, renderOrder);
    this.material = this.outline.material as THREE.MeshBasicMaterial;
  }

  draw(
    scene: THREE.Scene,
    clockDelta: number,
    tickPercent: number,
    location: Location3,
    angleRadians: number,
    pitchRadians: number,
    visible: boolean,
    modelOffsets: Location3[],
  ) {
    if (this.outline.parent !== scene) {
      scene.add(this.outline);
    }
    const { x, y } = location;
    this.outline.visible = this.renderable.visible(tickPercent) && visible;
    this.outline.position.x = x;
    this.outline.position.y = GROUND_OVERLAY_Y;
    this.outline.position.z = y;
    this.material.color.setHex(this.renderable.colorHex);
  }

  destroy(scene: THREE.Scene) {
    if (this.outline.parent === scene) {
      scene.remove(this.outline);
    }
  }

  getWorldPosition(): THREE.Vector3 {
    return this.outline.getWorldPosition(new THREE.Vector3());
  }

  async preload() {
    // do nothing
    return;
  }
}
