import * as THREE from "three";

// Ground overlays all share this clearance above the floor. Their visual
// priority is determined by render order, rather than by stacking them at
// slightly different heights.
export const GROUND_OVERLAY_Y = -0.49;

export enum GroundOverlayRenderOrder {
  MARKED_TILE = 100,
  TRUE_TILE = 200,
  HOVERED_TILE = 300,
}

export const drawLineOnTop = (mesh: THREE.Line, renderOrder: number) => {
  mesh.renderOrder = renderOrder;
  (mesh.material as THREE.Material).depthTest = false;
  (mesh.material as THREE.Material).depthWrite = false;
  (mesh.material as THREE.Material).transparent = true;
};

export const drawLineNormally = (mesh: THREE.Line) => {
  mesh.renderOrder = 0;
  (mesh.material as THREE.Material).depthTest = true;
  (mesh.material as THREE.Material).transparent = false;
};
