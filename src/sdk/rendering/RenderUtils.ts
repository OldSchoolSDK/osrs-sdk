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

/** A thin ground-plane frame, rendered as triangles so WebGL MSAA smooths its edges. */
export const createTileIndicator = (
  size: number,
  color: THREE.ColorRepresentation,
  renderOrder: number | null,
  thickness = 0.025,
) => {
  const inner = Math.max(0, size - thickness);
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(size, 0);
  shape.lineTo(size, size);
  shape.lineTo(0, size);
  shape.closePath();

  if (inner > 0) {
    const hole = new THREE.Path();
    hole.moveTo(thickness, thickness);
    hole.lineTo(thickness, inner);
    hole.lineTo(inner, inner);
    hole.lineTo(inner, thickness);
    hole.closePath();
    shape.holes.push(hole);
  }

  const geometry = new THREE.ShapeGeometry(shape);
  geometry.rotateX(-Math.PI / 2);
  const material = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide });
  const indicator = new THREE.Mesh(geometry, material);
  if (renderOrder !== null) {
    indicator.renderOrder = renderOrder;
    material.depthTest = false;
    material.depthWrite = false;
  }
  return indicator;
};

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
