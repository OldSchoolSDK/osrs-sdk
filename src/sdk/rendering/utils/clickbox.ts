import * as THREE from "three";

/** Owns model-space picking topology and reusable world-space clickbox data.
 * Configure after replacing geometry; invalidate after changing its pose or transform.
 * Returned arrays and bounds are borrowed storage, valid until the next update.
 */
export class ClickboxController {
  private mesh: THREE.Mesh | null = null;
  private authoredMesh: THREE.Mesh | null = null;
  private clickboxVertexIndices: number[] = [];
  private clickboxTriangleIndices: number[] = [];
  private clickboxVertices: THREE.Vector3[] = [];
  private clickboxVerticesDirty = true;
  private clickboxWorldBounds = new THREE.Box3();
  private clickboxBoundsDirty = true;

  constructor(private getSize: () => number) {}

  configure(mesh: THREE.Mesh, sourceVertices: readonly number[], authoredMesh: THREE.Mesh | null = null) {
    this.mesh = mesh;
    this.authoredMesh = authoredMesh;
    const position = mesh.geometry.getAttribute("position");
    const sourceToClickboxIndex = new Map<number, number>();
    const renderToClickboxIndex: number[] = [];
    this.clickboxVertexIndices = [];
    for (let index = 0; index < position.count; index++) {
      const source = sourceVertices[index] ?? index;
      let uniqueIndex = sourceToClickboxIndex.get(source);
      if (uniqueIndex === undefined) {
        uniqueIndex = this.clickboxVertexIndices.length;
        sourceToClickboxIndex.set(source, uniqueIndex);
        this.clickboxVertexIndices.push(index);
      }
      renderToClickboxIndex[index] = uniqueIndex;
    }
    this.clickboxTriangleIndices = [];
    const indices = mesh.geometry.index?.array ?? [];
    for (let i = 0; i < indices.length; i += 3) {
      const a = renderToClickboxIndex[indices[i]], b = renderToClickboxIndex[indices[i + 1]], c = renderToClickboxIndex[indices[i + 2]];
      // The extractor represents client-hidden type-2 faces as [a, a, a].
      if (a === b && b === c) continue;
      this.clickboxTriangleIndices.push(a, b, c);
    }
    this.clickboxVertices = [];
    this.invalidate();
    if (authoredMesh) {
      const offset = this.clickboxVertexIndices.length;
      const authoredIndices = authoredMesh.geometry.index?.array ?? [];
      for (let i = 0; i < authoredIndices.length; i += 3) {
        const a = authoredIndices[i], b = authoredIndices[i + 1], c = authoredIndices[i + 2];
        if (a === b && b === c) continue;
        this.clickboxTriangleIndices.push(offset + a, offset + b, offset + c);
      }
    }
  }

  invalidate() {
    this.clickboxBoundsDirty = true;
    this.clickboxVerticesDirty = true;
  }

  getVertices() {
    if (!this.mesh || !this.mesh.visible) return [];
    if (!this.clickboxVerticesDirty) return this.clickboxVertices;
    this.mesh.updateWorldMatrix(true, false);
    const position = this.mesh.geometry.getAttribute("position") as THREE.BufferAttribute | undefined;
    if (!position) return [];
    for (let i = 0; i < this.clickboxVertexIndices.length; i++) {
      const index = this.clickboxVertexIndices[i];
      const vertex = this.clickboxVertices[i] ?? (this.clickboxVertices[i] = new THREE.Vector3());
      vertex.set(position.getX(index), position.getY(index), position.getZ(index)).applyMatrix4(this.mesh.matrixWorld);
    }
    if (this.authoredMesh) {
      this.authoredMesh.updateWorldMatrix(true, false);
      const authored = this.authoredMesh.geometry.getAttribute("position") as THREE.BufferAttribute;
      for (let i = 0; i < authored.count; i++) {
        const index = this.clickboxVertexIndices.length + i;
        const vertex = this.clickboxVertices[index] ?? (this.clickboxVertices[index] = new THREE.Vector3());
        vertex.set(authored.getX(i), authored.getY(i), authored.getZ(i)).applyMatrix4(this.authoredMesh.matrixWorld);
      }
    }
    this.clickboxVerticesDirty = false;
    return this.clickboxVertices;
  }
  getBounds() {
    if (!this.mesh || !this.mesh.visible || !this.clickboxVertexIndices.length) return null;
    if (!this.clickboxBoundsDirty) return this.clickboxWorldBounds;
    this.mesh.updateWorldMatrix(true, false);
    // calculateBoundingBox rotates the actual vertices before taking extrema,
    // includes the origin, enforces 32-unit horizontal half-extents and adds
    // another 8 units for a one-tile model. Rotating a precomputed local box
    // would overestimate slender models, particularly at diagonal headings.
    const e = this.mesh.matrixWorld.elements;
    this.clickboxWorldBounds.min.set(e[12], e[13], e[14]);
    this.clickboxWorldBounds.max.copy(this.clickboxWorldBounds.min);
    this.expandBounds(this.mesh.geometry.getAttribute("position") as THREE.BufferAttribute,
      this.mesh.matrixWorld, this.clickboxVertexIndices);
    if (this.authoredMesh) {
      this.authoredMesh.updateWorldMatrix(true, false);
      this.expandBounds(this.authoredMesh.geometry.getAttribute("position") as THREE.BufferAttribute,
        this.authoredMesh.matrixWorld);
    }
    const { min, max } = this.clickboxWorldBounds;
    const padding = this.getSize() === 1 ? 8 / 128 : 0;
    for (const axis of ["x", "z"] as const) {
      const center = (min[axis] + max[axis]) / 2;
      const extent = Math.max(32 / 128, (max[axis] - min[axis] + 1 / 128) / 2) + padding;
      min[axis] = center - extent; max[axis] = center + extent;
    }
    min.y -= 1 / 256; max.y += 1 / 256;
    this.clickboxBoundsDirty = false;
    return this.clickboxWorldBounds;
  }
  private expandBounds(position: THREE.BufferAttribute, matrix: THREE.Matrix4, indices?: readonly number[]) {
    const e = matrix.elements;
    const { min, max } = this.clickboxWorldBounds;
    for (let i = 0; i < (indices?.length ?? position.count); i++) {
      const index = indices?.[i] ?? i;
      const x = position.getX(index), y = position.getY(index), z = position.getZ(index);
      const wx = e[0] * x + e[4] * y + e[8] * z + e[12];
      const wy = e[1] * x + e[5] * y + e[9] * z + e[13];
      const wz = e[2] * x + e[6] * y + e[10] * z + e[14];
      min.x = Math.min(min.x, wx); min.y = Math.min(min.y, wy); min.z = Math.min(min.z, wz);
      max.x = Math.max(max.x, wx); max.y = Math.max(max.y, wy); max.z = Math.max(max.z, wz);
    }
  }
  getTriangles() { return this.clickboxTriangleIndices; }
}
