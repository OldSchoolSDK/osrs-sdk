import * as THREE from "three";
import { Location3 } from "../Location";
import { Renderable, RenderableListener } from "../Renderable";
import { CacheRender, CacheRenderBundleError } from "./CacheRenderBundle";
import { CacheRenderReference } from "./CacheRenderReference";
import { Model } from "./Model";

const MAGIC = "OSRB";
// CPU-side frame-map animation is used for standard sequences. Animaya
// sequences continue to use the extracted baked-frame fallback.
const ENABLE_CACHE_RENDER_ANIMATIONS = true;
type RawFrame = { types: number[]; maps: number[][]; indexFrameIds: number[]; x: number[]; y: number[]; z: number[] };
type AnimationPayload = { frames: number[][]; lengths: number[]; rawFrames?: RawFrame[] };
type Payload = { version: 1; positions: number[]; indices?: number[]; vertexGroups?: number[][]; normals?: number[]; color?: number; animations?: Record<string, AnimationPayload>; poseMap?: Record<string, number> };

function mergePayloads(payloads: Payload[]): Payload {
  const nonEmpty = payloads.filter((payload) => (payload.indices?.length ?? 0) > 0 || payload.positions.length > 3);
  const positions: number[] = [];
  const indices: number[] = [];
  const vertexGroups: number[][] = [];
  const animations: Record<string, AnimationPayload> = {};
  let vertexOffset = 0;
  nonEmpty.forEach((payload) => {
    positions.push(...payload.positions);
    const localIndices = payload.indices ?? Array.from({ length: payload.positions.length / 3 }, (_, index) => index);
    indices.push(...localIndices.map((index) => index + vertexOffset));
    vertexOffset += payload.positions.length / 3;
    (payload.vertexGroups ?? []).forEach((group, groupIndex) => {
      vertexGroups[groupIndex] ??= [];
      vertexGroups[groupIndex].push(...group.map((index) => index + vertexOffset - payload.positions.length / 3));
    });
    Object.entries(payload.animations ?? {}).forEach(([id, animation]) => {
      const existing = animations[id];
      if (!existing) {
        animations[id] = { frames: animation.frames.map((frame) => frame.slice()), lengths: animation.lengths.slice(), rawFrames: animation.rawFrames };
      } else {
        animation.frames.forEach((frame, index) => {
          if (existing.frames[index]) existing.frames[index].push(...frame);
        });
      }
    });
  });
  return {
    version: 1,
    positions,
    indices,
    vertexGroups,
    color: nonEmpty[0]?.color,
    animations,
    poseMap: Object.assign({}, ...payloads.map((payload) => payload.poseMap ?? {})),
  };
}

function applyRawFrame(positions: Float32Array, groups: number[][], frame: RawFrame) {
  const x = new Float64Array(positions.length / 3), y = new Float64Array(x.length), z = new Float64Array(x.length);
  for (let i = 0; i < x.length; i++) { x[i] = positions[i * 3]; y[i] = -positions[i * 3 + 1]; z[i] = -positions[i * 3 + 2]; }
  const pivot = { x: 0, y: 0, z: 0 };
  for (let i = 0; i < frame.indexFrameIds.length; i++) {
    const type = frame.types[frame.indexFrameIds[i]], map = frame.maps[frame.indexFrameIds[i]] ?? [];
    const dx0 = frame.x[i] ?? 0, dy0 = frame.y[i] ?? 0, dz0 = frame.z[i] ?? 0;
    const dx = dx0 / 128, dy = dy0 / 128, dz = dz0 / 128;
    if (type === 0) {
      let count = 0; pivot.x = pivot.y = pivot.z = 0;
      for (const group of map) for (const index of groups[group] ?? []) { pivot.x += x[index]; pivot.y += y[index]; pivot.z += z[index]; count++; }
      if (count) { pivot.x = dx + pivot.x / count; pivot.y = dy + pivot.y / count; pivot.z = dz + pivot.z / count; }
      else { pivot.x = dx; pivot.y = dy; pivot.z = dz; }
      continue;
    }
    for (const group of map) for (const index of groups[group] ?? []) {
      if (type === 1) { x[index] += dx; y[index] += dy; z[index] += dz; continue; }
      x[index] -= pivot.x; y[index] -= pivot.y; z[index] -= pivot.z;
      if (type === 2) {
        let s = Math.sin((dz0 & 255) * 8 * Math.PI / 1024), c = Math.cos((dz0 & 255) * 8 * Math.PI / 1024), t = s * y[index] + c * x[index]; y[index] = c * y[index] - s * x[index]; x[index] = t;
        s = Math.sin((dx0 & 255) * 8 * Math.PI / 1024); c = Math.cos((dx0 & 255) * 8 * Math.PI / 1024); t = c * y[index] - s * z[index]; z[index] = s * y[index] + c * z[index]; y[index] = t;
        s = Math.sin((dy0 & 255) * 8 * Math.PI / 1024); c = Math.cos((dy0 & 255) * 8 * Math.PI / 1024); t = s * z[index] + c * x[index]; z[index] = c * z[index] - s * x[index]; x[index] = t;
      } else if (type === 3) { x[index] *= dx0 / 128; y[index] *= dy0 / 128; z[index] *= dz0 / 128; }
      x[index] += pivot.x; y[index] += pivot.y; z[index] += pivot.z;
    }
  }
  for (let i = 0; i < x.length; i++) { positions[i * 3] = x[i]; positions[i * 3 + 1] = -y[i]; positions[i * 3 + 2] = -z[i]; }
}

export function decodeCacheRenderPayload(bytes: ArrayBuffer): Payload {
  const input = new Uint8Array(bytes);
  if (input.length < 8 || String.fromCharCode(input[0], input[1], input[2], input[3]) !== MAGIC) throw new CacheRenderBundleError("manifest", "Invalid cache render binary payload");
  const length = new DataView(bytes).getUint32(4, true);
  if (length !== input.length - 8) throw new CacheRenderBundleError("manifest", "Truncated cache render binary payload");
  const payload = JSON.parse(new TextDecoder().decode(input.slice(8)));
  if (payload.version !== 1 || !Array.isArray(payload.positions) || payload.positions.length % 3) throw new CacheRenderBundleError("manifest", "Unsupported cache render payload schema");
  return payload;
}

/** Three.js implementation for decoded cache geometry. Cache extraction owns the conversion from OSRS frames to this payload. */
export class CacheRenderModel implements Model, RenderableListener {
  private root = new THREE.Group();
  private mesh: THREE.Mesh | null = null;
  private ready: Promise<void> | null = null;
  private lastPose = -1;
  private activeAnimation = -1;
  private animations: Record<string, AnimationPayload> = {};
  private poseMap: Record<string, number> = {};
  private animationTime = 0;
  private animationPlaying = false;
  private basePositions: Float32Array | null = null;
  private vertexGroups: number[][] = [];

  constructor(private renderable: Renderable, private reference: CacheRenderReference) { }
  static forRenderable(renderable: Renderable, reference: CacheRenderReference) { return new CacheRenderModel(renderable, reference); }
  async animationChanged(id: number, _blend: boolean) {
    if (ENABLE_CACHE_RENDER_ANIMATIONS) { this.activeAnimation = id; this.animationTime = 0; this.animationPlaying = true; }
    return Promise.resolve();
  }
  modelChanged() {
    const next = this.renderable.get3dModel();
    const nextPrimary = (next as any)?.getPrimaryModel?.();
    if (next instanceof CacheRenderModel && next !== this) this.reference = next.reference;
    else if (nextPrimary instanceof CacheRenderModel) this.reference = nextPrimary.reference;
    this.ready = null;
    this.mesh = null;
    this.animations = {};
    this.poseMap = {};
    this.basePositions = null;
    this.vertexGroups = [];
    this.root.clear();
  }
  async preload() { await this.ensureLoaded(); }

  private async ensureLoaded() {
    if (this.ready) return this.ready;
    this.ready = (async () => {
      const bundle = await CacheRender.bundle();
      const payloads = await Promise.all(bundle.assetIds(this.reference).map(async id => decodeCacheRenderPayload(await bundle.fetchAsset(id))));
      const payload = mergePayloads(payloads);
      Object.assign(this.animations, payload.animations ?? {});
      Object.assign(this.poseMap, payload.poseMap ?? {});
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(payload.positions, 3));
      geometry.setIndex(payload.indices ?? []);
      geometry.computeVertexNormals();
      geometry.computeBoundingSphere();
      const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: payload.color ?? 0xffffff, flatShading: true }));
      this.basePositions = new Float32Array(payload.positions);
      this.vertexGroups = payload.vertexGroups ?? [];
      mesh.userData.clickable = this.renderable.selectable;
      mesh.userData.unit = this.renderable;
      mesh.userData.cacheAnimations = payload.animations ?? {};
      this.root.add(mesh);
      this.mesh = mesh;
    })();
    return this.ready;
  }
  draw(scene: THREE.Scene, clockDelta: number, _tickPercent: number, location: Location3, rotation: number, pitch: number, visible: boolean, modelOffsets: Location3[]) {
    this.ensureLoaded().catch((error) => {
      // FallbackModel keeps the viewport alive, but do not hide why cache rendering
      // was skipped (bad URL, integrity failure, or an absent loadout reference).
      console.error("[osrs-sdk] Cache render preload failed; using GLTF fallback", error);
    });
    if (this.root.parent !== scene) {
      scene.add(this.root);
      this.renderable.setAnimationListener(this);
    }
    const size = this.renderable.size;
    this.root.visible = visible && this.mesh !== null;
    this.root.position.set(location.x + size / 2, location.z - 0.49, location.y - size / 2);
    this.root.rotation.order = "YXZ";
    this.root.rotation.set(pitch, rotation + Math.PI / 2, 0);
    this.root.children.forEach((child, index) => {
      const offset = modelOffsets[index]; child.position.set(offset?.x ?? 0, offset?.z ?? 0, offset?.y ?? 0);
    });
    const pose = this.renderable.animationIndex;
    if (!ENABLE_CACHE_RENDER_ANIMATIONS) { this.lastPose = pose; return; }
    if (!this.animationPlaying && pose !== this.lastPose) {
      this.activeAnimation = this.poseMap[String(pose)] ?? -1;
      this.animationTime = 0;
    }
    this.animationTime += clockDelta;
    const animation = this.animations[String(this.activeAnimation)];
    if (animation?.frames.length && this.root.children.length) {
      const total = animation.lengths.reduce((sum, length) => sum + length, 0) / 50;
      let time = this.animationTime;
      if (this.animationPlaying && time >= total) {
        this.animationPlaying = false;
        this.activeAnimation = this.poseMap[String(pose)] ?? -1;
        this.animationTime = 0;
        time = 0;
      } else if (total > 0) time %= total;
      let elapsed = 0;
      let frame = 0;
      for (; frame < animation.lengths.length - 1 && time >= elapsed + animation.lengths[frame] / 50; frame++) elapsed += animation.lengths[frame] / 50;
      const next = Math.min(frame + 1, animation.frames.length - 1);
      const blend = animation.lengths[frame] ? Math.min(1, (time - elapsed) / (animation.lengths[frame] / 50)) : 0;
      const vertices = animation.frames[frame];
      const nextVertices = animation.frames[next];
      const position = this.mesh?.geometry.getAttribute("position") as THREE.BufferAttribute | undefined;
      if (position && this.basePositions) {
        if (animation.rawFrames?.[frame]) {
          const transformed = new Float32Array(this.basePositions);
          applyRawFrame(transformed, this.vertexGroups, animation.rawFrames[frame]);
          position.array.set(transformed);
        } else if (position.count * 3 === vertices.length) {
          for (let i = 0; i < vertices.length; i++) position.array[i] = vertices[i] + (nextVertices[i] - vertices[i]) * blend;
        }
        position.needsUpdate = true;
        this.mesh?.geometry.computeVertexNormals();
      }
    }
    this.lastPose = pose;
  }
  destroy(scene: THREE.Scene) { if (this.root.parent === scene) scene.remove(this.root); this.renderable.clearAnimationListener(); }
  getWorldPosition() { return this.root.getWorldPosition(new THREE.Vector3()); }
}
