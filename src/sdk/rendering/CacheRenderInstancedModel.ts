import * as THREE from "three";
import { Location3 } from "../Location";
import { Renderable } from "../Renderable";
import { CacheRender } from "./CacheRenderBundle";
import { CacheRenderReference } from "./CacheRenderReference";
import { applyRawFrame, cachedPayload, mergePayloads } from "./CacheRenderModel";
import { Model } from "./Model";

// Repeated cache models (such as the wall men) share one GPU geometry and are
// drawn with a single instanced draw call. Synchronized CPU animation updates
// are applied once per pool, while placement transforms remain per instance.
const MAX_INSTANCES = 128;
type Pool = { mesh: THREE.InstancedMesh; ready: Promise<void>; next: number; scale: number; positions: Float32Array; groups: number[][]; sources: number[]; frames: any[]; lengths: number[]; elapsed: number };
const pools = new Map<string, Pool>();

function poolKey(reference: CacheRenderReference, ids: string[]) {
  return `${reference.kind}:${ids.join(",")}`;
}

export class CacheRenderInstancedModel implements Model {
  private pool: Pool | null = null;
  private slot = -1;
  private worldPosition = new THREE.Vector3();

  constructor(private renderable: Renderable, private reference: CacheRenderReference) {}

  static forRenderable(renderable: Renderable, reference: CacheRenderReference) {
    return new CacheRenderInstancedModel(renderable, reference);
  }

  private async ensurePool() {
    if (this.pool) return this.pool;
    const bundle = await CacheRender.bundle();
    const ids = [...bundle.assetIds(this.reference), ...bundle.sharedAssetIds(this.reference)];
    const key = poolKey(this.reference, ids);
    let pool = pools.get(key);
    if (!pool) {
      pool = { next: 0, mesh: null as any, ready: Promise.resolve(), scale: 1, positions: new Float32Array(), groups: [], sources: [], frames: [], lengths: [], elapsed: 0 };
      pool.ready = Promise.all(ids.map((id) => cachedPayload(bundle, id))).then((payloads) => {
        const payload = mergePayloads(payloads);
        pool!.scale = payload.scale ?? 1;
        pool!.positions = new Float32Array(payload.positions);
        pool!.groups = payload.vertexGroups ?? [];
        pool!.sources = payload.sourceVertices ?? [];
        const animation = payload.animations?.[String(payload.poseMap?.["0"] ?? 7508)];
        pool!.frames = animation?.rawFrames ?? [];
        pool!.lengths = animation?.lengths ?? [];
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.Float32BufferAttribute(payload.positions, 3));
        if (payload.colors && payload.colors.length * 3 === payload.positions.length) {
          const colors: number[] = [];
          payload.colors.forEach((value) => { const c = new THREE.Color(value); colors.push(c.r, c.g, c.b); });
          geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
        }
        geometry.setIndex(payload.indices ?? []);
        geometry.computeVertexNormals();
        const material = new THREE.MeshStandardMaterial({
          color: payload.color ?? 0xffffff,
          vertexColors: Boolean(payload.colors?.length),
          flatShading: true,
        });
        pool!.mesh = new THREE.InstancedMesh(geometry, material, MAX_INSTANCES);
        pool!.mesh.frustumCulled = false;
        // Hide unclaimed instances until their first transform is written.
        const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
        for (let i = 0; i < MAX_INSTANCES; i++) pool!.mesh.setMatrixAt(i, hidden);
        pool!.mesh.instanceMatrix.needsUpdate = true;
      });
      pools.set(key, pool);
    }
    await pool.ready;
    this.pool = pool;
    if (this.slot < 0) {
      if (pool.next >= MAX_INSTANCES) throw new Error("Cache render instance capacity exceeded");
      this.slot = pool.next++;
    }
    return pool;
  }

  draw(scene: THREE.Scene, _clockDelta: number, _tickPercent: number, location: Location3, rotation: number, pitch: number, visible: boolean, modelOffsets: Location3[]) {
    this.ensurePool().then((pool) => {
      if (pool.mesh.parent !== scene) scene.add(pool.mesh);
      // Wall men all use the same idle sequence. Apply the CPU deformation
      // once, on the first instance, then all placements share the result.
      if (this.slot === 0 && pool.frames.length) {
        pool.elapsed += _clockDelta;
        const total = pool.lengths.reduce((sum, n) => sum + n, 0) / 50;
        if (total > 0) pool.elapsed %= total;
        let elapsed = 0, frame = 0;
        while (frame < pool.lengths.length - 1 && pool.elapsed >= elapsed + pool.lengths[frame] / 50) { elapsed += pool.lengths[frame] / 50; frame++; }
        const transformed = new Float32Array(pool.positions);
        applyRawFrame(transformed, pool.groups, pool.sources, pool.frames[frame]);
        pool.mesh.geometry.getAttribute("position").array.set(transformed);
        (pool.mesh.geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
        pool.mesh.geometry.computeBoundingSphere();
      }
      const offset = modelOffsets[0];
      const size = this.renderable.size;
      this.worldPosition.set(location.x + size / 2 + (offset?.x ?? 0), location.z - 0.49 + (offset?.z ?? 0), location.y - size / 2 + (offset?.y ?? 0));
      const matrix = new THREE.Object3D();
      matrix.position.copy(this.worldPosition);
      matrix.rotation.order = "YXZ";
      matrix.rotation.set(pitch, rotation + Math.PI / 2, 0);
      matrix.scale.set(pool.scale, pool.scale, pool.scale);
      matrix.updateMatrix();
      pool.mesh.setMatrixAt(this.slot, visible ? matrix.matrix : new THREE.Matrix4().makeScale(0, 0, 0));
      pool.mesh.instanceMatrix.needsUpdate = true;
    }).catch((error) => console.error("[osrs-sdk] Cache render instance preload failed", error));
  }

  destroy(_scene: THREE.Scene) {
    if (this.pool && this.slot >= 0) {
      this.pool.mesh.setMatrixAt(this.slot, new THREE.Matrix4().makeScale(0, 0, 0));
      this.pool.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  getWorldPosition() { return this.worldPosition; }
  async preload() { await this.ensurePool(); }
}
