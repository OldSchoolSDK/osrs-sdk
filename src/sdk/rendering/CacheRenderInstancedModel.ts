import * as THREE from "three";
import type { CacheRenderAnimation } from "../../cache-render-format";
import { Location3 } from "../Location";
import { Renderable } from "../Renderable";
import { AnimationFrameSoundPlayer, preloadAnimationFrameSounds } from "./AnimationFrameSounds";
import { CacheRender } from "./CacheRenderBundle";
import { applyRawFrame, cachedPayload, mergePayloads } from "./CacheRenderModel";
import { CacheRenderReference } from "./CacheRenderReference";
import { Model } from "./Model";

// Animated instances cannot all mutate one shared geometry when their start
// delays differ. A pool therefore owns one pre-posed geometry per cache frame;
// instances move between frame buckets while retaining their own clock.
const DEFAULT_MAX_INSTANCES = 256;
const CLIENT_FRAMES_PER_SECOND = 50;
let hiddenMatrixValue: THREE.Matrix4 | undefined;
const hiddenMatrix = () => hiddenMatrixValue ??= new THREE.Matrix4().makeScale(0, 0, 0);

type AnimationFrameMesh = { mesh: THREE.InstancedMesh; active: Set<number> };
type Pool = {
  ready: Promise<void>; capacity: number; next: number; free: number[]; active: Set<number>;
  frames: AnimationFrameMesh[]; scaleX: number; scaleY: number;
  animationId: number; animation?: CacheRenderAnimation; animationTotal: number; loopElapsed: number;
  frameSoundPlayer: AnimationFrameSoundPlayer; frameSoundsReady: Promise<void>;
};

export type CacheRenderInstancedModelOptions = {
  /** Called once when a spotanim-only instance reaches the end of its sequence. */
  onSpotAnimComplete?: () => void;
};

const pools = new Map<string, Pool>();

function stableRecolorKey(recolor?: Record<string, number>) {
  return JSON.stringify(Object.entries(recolor ?? {}).sort(([left], [right]) => left.localeCompare(right)));
}

function poolKey(reference: CacheRenderReference, ids: string[], bundleVersion: string) {
  const spot = reference.kind === "spotAnim" ? reference.spotAnims[0] : undefined;
  // Placement, rotation, height and animation delay belong to the instance.
  // Recolouring changes shared vertex data and therefore still needs a pool.
  return `${bundleVersion}:${reference.kind}:${ids.join(",")}:${stableRecolorKey(spot?.recolor)}`;
}

export function cacheAnimationDuration(lengths: number[]) {
  return lengths.reduce((sum, length) => sum + length, 0) / CLIENT_FRAMES_PER_SECOND;
}

/** Resolve an elapsed animation time to a discrete cache frame. */
export function cacheAnimationFrameAt(lengths: number[], elapsed: number, frameCount: number, oneShot: boolean) {
  if (frameCount <= 0 || elapsed < 0) return -1;
  const total = cacheAnimationDuration(lengths);
  if (total <= 0) return 0;
  const time = oneShot ? Math.min(elapsed, Math.max(0, total - Number.EPSILON)) : elapsed % total;
  let boundary = 0;
  let frame = 0;
  while (frame < Math.min(lengths.length, frameCount) - 1 && time >= boundary + lengths[frame] / CLIENT_FRAMES_PER_SECOND) {
    boundary += lengths[frame] / CLIENT_FRAMES_PER_SECOND;
    frame++;
  }
  return Math.min(frame, frameCount - 1);
}

function posedFrames(
  positions: number[],
  baseAlphas: Float32Array,
  vertexGroups: number[][],
  sourceVertices: number[],
  alphaGroups: number[][],
  animayaGroups: number[][],
  animayaScales: number[][],
  animation?: CacheRenderAnimation,
) {
  const rawFrames = animation?.rawFrames ?? [];
  const mayaFrames = animation?.mayaFrames ?? [];
  const expandedFrames = animation?.frames ?? [];
  const frameCount = rawFrames.length || mayaFrames.length || expandedFrames.length || 1;
  return Array.from({ length: frameCount }, (_, frame) => {
    const posedPositions = new Float32Array(positions);
    const posedAlphas = new Float32Array(baseAlphas);
    if (rawFrames[frame]) {
      applyRawFrame(posedPositions, vertexGroups, sourceVertices, rawFrames[frame], undefined, posedAlphas, alphaGroups);
    } else if (mayaFrames[frame]) {
      for (let vertex = 0; vertex < posedPositions.length / 3; vertex++) {
        const bones = animayaGroups[vertex] ?? [];
        const scales = animayaScales[vertex] ?? [];
        if (!bones.length) continue;
        const x = posedPositions[vertex * 3];
        const y = posedPositions[vertex * 3 + 1];
        const z = posedPositions[vertex * 3 + 2];
        let outputX = 0, outputY = 0, outputZ = 0, hasWeight = false;
        bones.forEach((bone, index) => {
          const matrix = mayaFrames[frame][bone];
          if (!matrix) return;
          const scale = (scales[index] ?? 255) / 255;
          hasWeight = true;
          outputX += (matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12] / 128) * scale;
          outputY += (matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13] / 128) * scale;
          outputZ += (matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14] / 128) * scale;
        });
        if (hasWeight) {
          posedPositions[vertex * 3] = outputX;
          posedPositions[vertex * 3 + 1] = outputY;
          posedPositions[vertex * 3 + 2] = outputZ;
        }
      }
    } else if (expandedFrames[frame]?.length === posedPositions.length) {
      posedPositions.set(expandedFrames[frame]);
    }
    return { positions: posedPositions, alphas: posedAlphas };
  });
}

export class CacheRenderInstancedModel implements Model {
  private pool: Pool | null = null;
  private slot = -1;
  private currentFrame = -1;
  private elapsed = 0;
  private started = false;
  private completionNotified = false;
  private frameSoundPlayer = new AnimationFrameSoundPlayer();
  private worldPosition = new THREE.Vector3();
  private transform = new THREE.Object3D();
  private destroyed = false;

  constructor(
    private renderable: Renderable,
    private reference: CacheRenderReference,
    private maxInstances = DEFAULT_MAX_INSTANCES,
    private options: CacheRenderInstancedModelOptions = {},
  ) {}

  static forRenderable(renderable: Renderable, reference: CacheRenderReference, options?: CacheRenderInstancedModelOptions) {
    return new CacheRenderInstancedModel(renderable, reference, DEFAULT_MAX_INSTANCES, options);
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
      pool = {
        ready: Promise.resolve(), capacity: this.maxInstances, next: 0, free: [], active: new Set(), frames: [],
        scaleX: 1, scaleY: 1, animationId: -1, animationTotal: 0, loopElapsed: 0,
        frameSoundPlayer: new AnimationFrameSoundPlayer(), frameSoundsReady: Promise.resolve(),
      };
      pool.ready = Promise.all(ids.map((id) => cachedPayload(bundle, id))).then((payloads) => {
        const payload = mergePayloads(payloads);
        const spotPayload = payloads[0];
        const metadata = spotPayload?.spotAnim ?? payload.spotAnim ?? {};
        pool!.scaleX = (payload.scale ?? 1) * (metadata.resizeX ?? 128) / 128;
        pool!.scaleY = (payload.scale ?? 1) * (metadata.resizeY ?? 128) / 128;
        const groups = payload.vertexGroups ?? [];
        const sources = payload.sourceVertices ?? [];
        const baseAlphas = new Float32Array(payload.alphas ?? Array(payload.positions.length / 3).fill(0));
        const alphaGroups = payload.alphaGroups ?? [];
        const animationId = this.reference.kind === "spotAnim" ? metadata.animationId : payload.poseMap?.["0"] ?? 0;
        const animation = payload.animations?.[String(animationId)];
        pool!.animationId = animationId;
        pool!.animation = animation;
        pool!.animationTotal = cacheAnimationDuration(animation?.lengths ?? []);
        pool!.frameSoundsReady = preloadAnimationFrameSounds(animation ? [animation] : [])
          .catch((error) => console.error("[osrs-sdk] Cache animation sound preload failed", error));

        const terrain = this.reference.kind === "asset" && this.reference.assetId.endsWith("-terrain");
        const material = new THREE.MeshStandardMaterial({
          color: payload.color ?? 0xffffff,
          vertexColors: Boolean(payload.colors?.length),
          flatShading: true,
          transparent: Boolean(payload.alphas?.some((alpha) => alpha !== 0)),
          alphaTest: 0.01,
          polygonOffset: terrain,
          polygonOffsetFactor: terrain ? 1 : 0,
          polygonOffsetUnits: terrain ? 1 : 0,
        });
        const recolor = placement?.recolor ?? {};
        const frameData = posedFrames(
          payload.positions,
          baseAlphas,
          groups,
          sources,
          alphaGroups,
          payload.animayaGroups ?? [],
          payload.animayaScales ?? [],
          animation,
        );
        pool!.frames = frameData.map((frame) => {
          const geometry = new THREE.BufferGeometry();
          geometry.setAttribute("position", new THREE.Float32BufferAttribute(frame.positions, 3));
          if (payload.colors && payload.colors.length * 3 === payload.positions.length) {
            const colors: number[] = [];
            payload.colors.forEach((value, index) => {
              const color = new THREE.Color(recolor[String(spotPayload?.faceColors?.[index])] ?? value);
              colors.push(color.r, color.g, color.b, 1 - (frame.alphas[index] & 255) / 255);
            });
            geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 4));
          }
          geometry.setIndex(payload.indices ?? []);
          geometry.computeVertexNormals();
          const mesh = new THREE.InstancedMesh(geometry, material, pool!.capacity);
          mesh.frustumCulled = false;
          mesh.count = 0;
          for (let index = 0; index < pool!.capacity; index++) mesh.setMatrixAt(index, hiddenMatrix());
          mesh.instanceMatrix.needsUpdate = true;
          return { mesh, active: new Set<number>() };
        });
      });
      pools.set(key, pool);
    }
    await pool.ready;
    if (this.destroyed) return pool;
    this.pool = pool;
    if (this.slot < 0) {
      if (!pool.active.size) {
        pool.loopElapsed = 0;
        pool.frameSoundPlayer.reset();
      }
      const reused = pool.free.pop();
      if (reused == null && pool.next >= pool.capacity) throw new Error("Cache render instance capacity exceeded");
      this.slot = reused ?? pool.next++;
      pool.active.add(this.slot);
    }
    return pool;
  }

  private setFrame(scene: THREE.Scene, pool: Pool, frame: number, matrix?: THREE.Matrix4) {
    if (this.currentFrame !== frame) {
      if (this.currentFrame >= 0) {
        const previous = pool.frames[this.currentFrame];
        previous.mesh.setMatrixAt(this.slot, hiddenMatrix());
        previous.mesh.instanceMatrix.needsUpdate = true;
        previous.active.delete(this.slot);
        if (!previous.active.size && previous.mesh.parent === scene) scene.remove(previous.mesh);
      }
      this.currentFrame = frame;
      if (frame >= 0) pool.frames[frame].active.add(this.slot);
    }
    if (frame < 0) return;
    const bucket = pool.frames[frame];
    if (bucket.mesh.parent !== scene) scene.add(bucket.mesh);
    bucket.mesh.count = pool.next;
    bucket.mesh.setMatrixAt(this.slot, matrix ?? hiddenMatrix());
    bucket.mesh.instanceMatrix.needsUpdate = true;
  }

  draw(scene: THREE.Scene, clockDelta: number, _tickPercent: number, location: Location3, rotation: number, pitch: number, visible: boolean, modelOffsets: Location3[]) {
    this.ensurePool().then((pool) => {
      if (this.destroyed || this.slot < 0 || !pool.frames.length) return;
      const oneShot = this.reference.kind === "spotAnim";
      if (oneShot && visible) {
        if (this.started) this.elapsed += Math.max(0, clockDelta);
        else this.started = true;
      } else {
        let leader = pool.capacity;
        pool.active.forEach((slot) => { leader = Math.min(leader, slot); });
        if (this.slot === leader && visible) pool.loopElapsed += Math.max(0, clockDelta);
      }

      const placement = this.reference.kind === "spotAnim" ? this.reference.spotAnims[0] : undefined;
      const animationTime = (oneShot ? this.elapsed : pool.loopElapsed) - (placement?.delay ?? 0) / CLIENT_FRAMES_PER_SECOND;
      const hasAnimation = Boolean(pool.animation && (pool.animation.rawFrames?.length || pool.animation.frames.length || pool.animation.mayaFrames?.length));
      const animationEnded = oneShot && animationTime >= 0 && (!hasAnimation || pool.animationTotal <= 0 || animationTime >= pool.animationTotal);
      if (animationEnded && !this.completionNotified) {
        this.completionNotified = true;
        this.options.onSpotAnimComplete?.();
      }

      const soundLocation = {
        x: location.x + (this.renderable.size - 1) / 2,
        y: location.y - (this.renderable.size - 1) / 2,
      };
      if (pool.animation && animationTime >= 0) {
        if (oneShot) this.frameSoundPlayer.advance(pool.animationId, pool.animation, Math.min(animationTime, pool.animationTotal), false, soundLocation);
        else {
          let leader = pool.capacity;
          pool.active.forEach((slot) => { leader = Math.min(leader, slot); });
          if (this.slot === leader) pool.frameSoundPlayer.advance(pool.animationId, pool.animation, pool.loopElapsed, true, soundLocation);
        }
      }

      const offset = modelOffsets[0];
      const size = this.renderable.size;
      this.worldPosition.set(location.x + size / 2 + (offset?.x ?? 0), location.z - 0.49 + (offset?.z ?? 0), location.y - size / 2 + (offset?.y ?? 0));
      this.transform.position.copy(this.worldPosition);
      this.transform.position.y += placement?.height ?? 0;
      this.transform.rotation.order = "YXZ";
      const basisRotation = oneShot ? 0 : Math.PI / 2;
      this.transform.rotation.set(pitch, rotation + basisRotation + (placement?.rotation ?? 0) * Math.PI / 1024, 0);
      this.transform.scale.set(pool.scaleX, pool.scaleY, pool.scaleX);
      this.transform.updateMatrix();

      const shown = visible && animationTime >= 0 && !animationEnded;
      const frame = shown
        ? (hasAnimation ? cacheAnimationFrameAt(pool.animation?.lengths ?? [], animationTime, pool.frames.length, oneShot) : 0)
        : -1;
      this.setFrame(scene, pool, frame, this.transform.matrix);
    }).catch((error) => console.error("[osrs-sdk] Cache render instance preload failed", error));
  }

  destroy(scene: THREE.Scene) {
    this.destroyed = true;
    if (this.pool && this.slot >= 0) {
      this.setFrame(scene, this.pool, -1);
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
