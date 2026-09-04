import * as THREE from "three";
import { Location3 } from "../Location";
import { Renderable } from "../Renderable";
import { CacheRender } from "./CacheRenderBundle";
import { CacheRenderReference } from "./CacheRenderReference";
import { applyRawFrame, cachedPayload, mergePayloads } from "./CacheRenderModel";
import { AnimationFrameSoundPlayer, preloadAnimationFrameSounds } from "./AnimationFrameSounds";
import { Model } from "./Model";
import type { CacheRenderAnimation } from "../../cache-render-format";

// Repeated cache models (such as the wall men) share one GPU geometry and are
// drawn with a single instanced draw call. Synchronized CPU animation updates
// are applied once per pool, while placement transforms remain per instance.
// Static arena recipes commonly contain more than 128 repeated floor or wall
// objects. Pools are shared per cache asset, so retain a conservative but
// scene-capable ceiling without duplicating their geometry.
const DEFAULT_MAX_INSTANCES = 128;
type Pool = {
  mesh: THREE.InstancedMesh; ready: Promise<void>; next: number; free: number[]; active: Set<number>;
  scaleX: number; scaleY: number; positions: Float32Array; groups: number[][]; sources: number[];
  baseAlphas: Float32Array; alphaGroups: number[][]; frames: any[]; lengths: number[]; elapsed: number; delay: number;
  animationId: number; animation?: CacheRenderAnimation; frameSoundPlayer: AnimationFrameSoundPlayer;
  frameSoundsReady: Promise<void>;
};
const pools = new Map<string, Pool>();
const hiddenMatrix = () => new THREE.Matrix4().makeScale(0, 0, 0);

function poolKey(reference: CacheRenderReference, ids: string[], bundleVersion: string) {
  const spot = reference.kind === "spotAnim" ? reference.spotAnims[0] : undefined;
  // Delay changes animation phase, while placement/rotation can remain an
  // instance matrix. Recolouring changes shared vertex data and needs a pool.
  return `${bundleVersion}:${reference.kind}:${ids.join(",")}:${spot?.delay ?? 0}:${JSON.stringify(spot?.recolor ?? {})}`;
}

export class CacheRenderInstancedModel implements Model {
  private pool: Pool | null = null;
  private slot = -1;
  private worldPosition = new THREE.Vector3();
  private transform = new THREE.Object3D();
  private destroyed = false;

  /**
   * 
   * @param renderable 
   * @param reference 
   * @param maxInstances max instances of this instanced model. Note that we pre-allocate this many models, so don't set it too high (especially for complex models like the scene)
   */
  constructor(private renderable: Renderable, private reference: CacheRenderReference, private maxInstances = DEFAULT_MAX_INSTANCES) {}

  static forRenderable(renderable: Renderable, reference: CacheRenderReference) {
    return new CacheRenderInstancedModel(renderable, reference);
  }

  private async ensurePool() {
    if (this.pool) return this.pool;
    const bundle = await CacheRender.bundle();
    const ids = this.reference.kind === "spotAnim"
      ? bundle.spotAnimIds(this.reference)
      : [...bundle.assetIds(this.reference), ...bundle.sharedAssetIds(this.reference)];
    const key = poolKey(this.reference, ids, bundle.manifest.bundleVersion);
    let pool = pools.get(key);
    if (!pool) {
      const placement = this.reference.kind === "spotAnim" ? this.reference.spotAnims[0] : undefined;
      pool = { next: 0, free: [], active: new Set(), mesh: null as any, ready: Promise.resolve(), scaleX: 1, scaleY: 1, positions: new Float32Array(), groups: [], sources: [], baseAlphas: new Float32Array(), alphaGroups: [], frames: [], lengths: [], elapsed: 0, delay: (placement?.delay ?? 0) / 50, animationId: -1, animation: undefined, frameSoundPlayer: new AnimationFrameSoundPlayer(), frameSoundsReady: Promise.resolve() };
      pool.ready = Promise.all(ids.map((id) => cachedPayload(bundle, id))).then((payloads) => {
        const payload = mergePayloads(payloads);
        const spotPayload = payloads[0];
        const metadata = spotPayload?.spotAnim ?? payload.spotAnim ?? {};
        pool!.scaleX = (payload.scale ?? 1) * (metadata.resizeX ?? 128) / 128;
        pool!.scaleY = (payload.scale ?? 1) * (metadata.resizeY ?? 128) / 128;
        pool!.positions = new Float32Array(payload.positions);
        pool!.groups = payload.vertexGroups ?? [];
        pool!.sources = payload.sourceVertices ?? [];
        pool!.baseAlphas = new Float32Array(payload.alphas ?? Array(payload.positions.length / 3).fill(0));
        pool!.alphaGroups = payload.alphaGroups ?? [];
        const animationId = this.reference.kind === "spotAnim" ? metadata.animationId : payload.poseMap?.["0"] ?? 0;
        const animation = payload.animations?.[String(animationId)];
        pool!.animationId = animationId;
        pool!.animation = animation;
        pool!.frames = animation?.rawFrames ?? [];
        pool!.lengths = animation?.lengths ?? [];
        pool!.frameSoundsReady = preloadAnimationFrameSounds(animation ? [animation] : [])
          .catch((error) => console.error("[osrs-sdk] Cache animation sound preload failed", error));
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.Float32BufferAttribute(payload.positions, 3));
        if (payload.colors && payload.colors.length * 3 === payload.positions.length) {
          const colors: number[] = [];
          const recolor = placement?.recolor ?? {};
          payload.colors.forEach((value, index) => {
            const c = new THREE.Color(recolor[String(spotPayload?.faceColors?.[index])] ?? value);
            colors.push(c.r, c.g, c.b, 1 - (pool!.baseAlphas[index] & 255) / 255);
          });
          geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 4));
        }
        geometry.setIndex(payload.indices ?? []);
        geometry.computeVertexNormals();
        const terrain = this.reference.kind === "asset" && this.reference.assetId.endsWith("-terrain");
        const material = new THREE.MeshStandardMaterial({
          color: payload.color ?? 0xffffff,
          vertexColors: Boolean(payload.colors?.length),
          flatShading: true,
          // A zero-filled alpha channel is normal for opaque cache geometry.
          // Marking it transparent disables the normal depth-write path and
          // causes terrain to fight with props and transparent shadows.
          transparent: Boolean(payload.alphas?.some((alpha) => alpha !== 0)),
          alphaTest: 0.01,
          // Keep a coplanar terrain face infinitesimally behind props without
          // changing its world-space height. This is the standard depth-bias
          // solution for floor/decoration z-fighting.
          polygonOffset: terrain,
          polygonOffsetFactor: terrain ? 1 : 0,
          polygonOffsetUnits: terrain ? 1 : 0,
        });
        pool!.mesh = new THREE.InstancedMesh(geometry, material, this.maxInstances);
        pool!.mesh.frustumCulled = false;
        // Hide unclaimed instances until their first transform is written.
        const hidden = hiddenMatrix();
        for (let i = 0; i < this.maxInstances; i++) pool!.mesh.setMatrixAt(i, hidden);
        pool!.mesh.instanceMatrix.needsUpdate = true;
      });
      pools.set(key, pool);
    }
    await pool.ready;
    if (this.destroyed) return pool;
    this.pool = pool;
    if (this.slot < 0) {
      if (!pool.active.size) {
        pool.elapsed = 0;
        pool.frameSoundPlayer.reset();
      }
      const reused = pool.free.pop();
      if (reused == null && pool.next >= this.maxInstances) throw new Error("Cache render instance capacity exceeded");
      this.slot = reused ?? pool.next++;
      pool.active.add(this.slot);
    }
    return pool;
  }

  draw(scene: THREE.Scene, _clockDelta: number, _tickPercent: number, location: Location3, rotation: number, pitch: number, visible: boolean, modelOffsets: Location3[]) {
    this.ensurePool().then((pool) => {
      if (this.destroyed || this.slot < 0) return;
      if (pool.mesh.parent !== scene) scene.add(pool.mesh);
      // Wall men all use the same idle sequence. Apply the CPU deformation
      // once, on the first instance, then all placements share the result.
      let leader = this.maxInstances;
      pool.active.forEach((slot) => { leader = Math.min(leader, slot); });
      // Do not consume a short spotanim timeline while its entity is still
      // waiting for its delayed visual reveal (or while the payload loads).
      if (this.slot === leader && visible) {
        pool.elapsed += _clockDelta;
      }
      const effectTime = pool.elapsed - pool.delay;
      if (this.slot === leader && pool.animation && effectTime >= 0) {
        const total = pool.lengths.reduce((sum, n) => sum + n, 0) / 50;
        const oneShot = this.reference.kind === "spotAnim";
        pool.frameSoundPlayer.advance(pool.animationId, pool.animation, oneShot ? Math.min(effectTime, total) : effectTime, !oneShot);
      }
      if (this.slot === leader && pool.frames.length && effectTime >= 0) {
        const total = pool.lengths.reduce((sum, n) => sum + n, 0) / 50;
        const oneShot = this.reference.kind === "spotAnim";
        // Spotanims are one-shot effects; actor model animations (WallMen)
        // continue looping as normal.
        const animationTime = total > 0
          ? (oneShot ? Math.min(effectTime, Math.max(0, total - 1e-6)) : effectTime % total)
          : 0;
        let elapsed = 0, frame = 0;
        while (frame < pool.lengths.length - 1 && animationTime >= elapsed + pool.lengths[frame] / 50) { elapsed += pool.lengths[frame] / 50; frame++; }
        const transformed = new Float32Array(pool.positions);
        const alphas = new Float32Array(pool.baseAlphas);
        applyRawFrame(transformed, pool.groups, pool.sources, pool.frames[frame], undefined, alphas, pool.alphaGroups);
        pool.mesh.geometry.getAttribute("position").array.set(transformed);
        (pool.mesh.geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
        const colors = pool.mesh.geometry.getAttribute("color") as THREE.BufferAttribute | undefined;
        if (colors?.itemSize === 4) {
          for (let i = 0; i < alphas.length; i++) colors.array[i * 4 + 3] = 1 - Math.max(0, Math.min(255, alphas[i])) / 255;
          colors.needsUpdate = true;
        }
      }
      const offset = modelOffsets[0];
      const size = this.renderable.size;
      this.worldPosition.set(location.x + size / 2 + (offset?.x ?? 0), location.z - 0.49 + (offset?.z ?? 0), location.y - size / 2 + (offset?.y ?? 0));
      const placement = this.reference.kind === "spotAnim" ? this.reference.spotAnims[0] : undefined;
      this.transform.position.copy(this.worldPosition);
      this.transform.position.y += placement?.height ?? 0;
      this.transform.rotation.order = "YXZ";
      const basisRotation = this.reference.kind === "spotAnim" ? 0 : Math.PI / 2;
      this.transform.rotation.set(pitch, rotation + basisRotation + (placement?.rotation ?? 0) * Math.PI / 1024, 0);
      this.transform.scale.set(pool.scaleX, pool.scaleY, pool.scaleX);
      this.transform.updateMatrix();
      const animationTotal = pool.lengths.reduce((sum, n) => sum + n, 0) / 50;
      const oneShot = this.reference.kind === "spotAnim";
      pool.mesh.setMatrixAt(this.slot, visible && effectTime >= 0 && (!oneShot || animationTotal <= 0 || effectTime < animationTotal) ? this.transform.matrix : hiddenMatrix());
      pool.mesh.instanceMatrix.needsUpdate = true;
    }).catch((error) => console.error("[osrs-sdk] Cache render instance preload failed", error));
  }

  destroy(_scene: THREE.Scene) {
    this.destroyed = true;
    if (this.pool && this.slot >= 0) {
      this.pool.mesh.setMatrixAt(this.slot, hiddenMatrix());
      this.pool.mesh.instanceMatrix.needsUpdate = true;
      this.pool.active.delete(this.slot);
      this.pool.free.push(this.slot);
      this.slot = -1;
    }
  }

  getWorldPosition() { return this.worldPosition; }
  async preload() {
    const pool = await this.ensurePool();
    await pool.frameSoundsReady;
  }
}
