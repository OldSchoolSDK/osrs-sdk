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
type RawFrame = { baseId?: number; types: number[]; maps: number[][]; indexFrameIds: number[]; x: number[]; y: number[]; z: number[] };
type AnimationPayload = { frames: number[][]; lengths: number[]; rawFrames?: RawFrame[]; interleaveLeave?: number[] };
type TexturePayload = { width: number; height: number; pixels: number[] };
type Payload = { version: 1; positions: number[]; indices?: number[]; vertexGroups?: number[][]; sourceVertices?: number[]; colors?: number[]; uvs?: number[]; textureIds?: number[]; textures?: Record<string, TexturePayload>; normals?: number[]; color?: number; animations?: Record<string, AnimationPayload>; poseMap?: Record<string, number> };

function mergePayloads(payloads: Payload[]): Payload {
  const nonEmpty = payloads.filter((payload) => (payload.indices?.length ?? 0) > 0 || payload.positions.length > 3);
  const positions: number[] = [];
  const indices: number[] = [];
  const vertexGroups: number[][] = [];
  const sourceVertices: number[] = [];
  const colors: number[] = [];
  const uvs: number[] = [], textureIds: number[] = [];
  const textures: Record<string, TexturePayload> = {};
  const animations: Record<string, AnimationPayload> = {};
  let vertexOffset = 0;
  let sourceVertexOffset = 0;
  nonEmpty.forEach((payload) => {
    positions.push(...payload.positions);
    if (payload.colors) colors.push(...payload.colors);
    if (payload.uvs) uvs.push(...payload.uvs);
    if (payload.textureIds) textureIds.push(...payload.textureIds);
    Object.assign(textures, payload.textures ?? {});
    const localVertexCount = payload.positions.length / 3;
    const localSources = payload.sourceVertices?.length === localVertexCount
      ? payload.sourceVertices
      : (() => {
        // Bundles extracted before sourceVertices existed can only recover
        // identity from bind-pose coordinates. Keep that recovery local to an
        // equipment payload so coincident vertices in separate items are never
        // accidentally treated as one animation vertex.
        const ids: number[] = [], byPosition = new Map<string, number>();
        for (let index = 0; index < localVertexCount; index++) {
          const key = `${payload.positions[index * 3]},${payload.positions[index * 3 + 1]},${payload.positions[index * 3 + 2]}`;
          let source = byPosition.get(key);
          if (source == null) { source = byPosition.size; byPosition.set(key, source); }
          ids.push(source);
        }
        return ids;
      })();
    sourceVertices.push(...localSources.map((index) => index + sourceVertexOffset));
    sourceVertexOffset += Math.max(localVertexCount, localSources.reduce((max, index) => Math.max(max, index + 1), 0));
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
        animations[id] = { frames: animation.frames.map((frame) => frame.slice()), lengths: animation.lengths.slice(), rawFrames: animation.rawFrames, interleaveLeave: animation.interleaveLeave };
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
    sourceVertices,
    colors: colors.length ? colors : undefined,
    uvs: uvs.length ? uvs : undefined, textureIds: textureIds.length ? textureIds : undefined,
    textures: Object.keys(textures).length ? textures : undefined,
    color: nonEmpty[0]?.color,
    animations,
    poseMap: Object.assign({}, ...payloads.map((payload) => payload.poseMap ?? {})),
  };
}

type TransformSelection = { indices: Set<number>; include: boolean };

/** Apply one legacy cache frame to a composed model.
 *
 * `selection` mirrors the client's two-pass animate2 operation: origin slots
 * always run, while other transform slots are selected by the primary
 * sequence's opcode-3 interleave list.
 */
export function applyRawFrame(positions: Float32Array, groups: number[][], sourceVertices: number[], frame: RawFrame, selection?: TransformSelection) {
  const x = new Float64Array(positions.length / 3), y = new Float64Array(x.length), z = new Float64Array(x.length);
  // Work in the cache's native model units. Besides avoiding accumulating
  // scale error, this lets the fixed-point rotations match the game/client
  // implementation's signed >> 16 arithmetic.
  for (let i = 0; i < x.length; i++) { x[i] = positions[i * 3] * 128; y[i] = -positions[i * 3 + 1] * 128; z[i] = -positions[i * 3 + 2] * 128; }
  const pivot = { x: 0, y: 0, z: 0 };
  for (let i = 0; i < frame.indexFrameIds.length; i++) {
    const transform = frame.indexFrameIds[i];
    const type = frame.types[transform], map = frame.maps[transform] ?? [];
    if (type !== 0 && selection && selection.indices.has(transform) !== selection.include) continue;
    const dx0 = frame.x[i] ?? 0, dy0 = frame.y[i] ?? 0, dz0 = frame.z[i] ?? 0;
    if (type === 0) {
      let count = 0; pivot.x = pivot.y = pivot.z = 0; const seen = new Set<number>();
      for (const group of map) for (const index of groups[group] ?? []) {
        // Textures/flat face colours expand a cache vertex into several render
        // vertices. Count that source vertex once when calculating a pivot,
        // but do not weld unrelated coincident vertices from different items.
        const source = sourceVertices[index] ?? index;
        if (seen.has(source)) continue;
        seen.add(source); pivot.x += x[index]; pivot.y += y[index]; pivot.z += z[index]; count++;
      }
      if (count) { pivot.x = dx0 + pivot.x / count; pivot.y = dy0 + pivot.y / count; pivot.z = dz0 + pivot.z / count; }
      else { pivot.x = dx0; pivot.y = dy0; pivot.z = dz0; }
      continue;
    }
    for (const group of map) for (const index of groups[group] ?? []) {
      if (type === 1) { x[index] += dx0; y[index] += dy0; z[index] += dz0; continue; }
      x[index] -= pivot.x; y[index] -= pivot.y; z[index] -= pivot.z;
      if (type === 2) {
        let angle = (dz0 & 255) * 8, s = Math.floor(65536 * Math.sin(angle * Math.PI / 1024)), c = Math.floor(65536 * Math.cos(angle * Math.PI / 1024));
        let t = (s * y[index] + c * x[index]) >> 16; y[index] = (c * y[index] - s * x[index]) >> 16; x[index] = t;
        angle = (dx0 & 255) * 8; s = Math.floor(65536 * Math.sin(angle * Math.PI / 1024)); c = Math.floor(65536 * Math.cos(angle * Math.PI / 1024));
        t = (c * y[index] - s * z[index]) >> 16; z[index] = (s * y[index] + c * z[index]) >> 16; y[index] = t;
        angle = (dy0 & 255) * 8; s = Math.floor(65536 * Math.sin(angle * Math.PI / 1024)); c = Math.floor(65536 * Math.cos(angle * Math.PI / 1024));
        t = (s * z[index] + c * x[index]) >> 16; z[index] = (c * z[index] - s * x[index]) >> 16; x[index] = t;
      } else if (type === 3) { x[index] *= dx0 / 128; y[index] *= dy0 / 128; z[index] *= dz0 / 128; }
      x[index] += pivot.x; y[index] += pivot.y; z[index] += pivot.z;
    }
  }
  for (let i = 0; i < x.length; i++) { positions[i * 3] = x[i] / 128; positions[i * 3 + 1] = -y[i] / 128; positions[i * 3 + 2] = -z[i] / 128; }
}

export function applyBlendedRawFrames(positions: Float32Array, groups: number[][], sourceVertices: number[], primary: RawFrame, pose: RawFrame, interleave: number[]) {
  const selection = new Set(interleave.filter((index) => index !== 9999999));
  applyRawFrame(positions, groups, sourceVertices, primary, { indices: selection, include: false });
  applyRawFrame(positions, groups, sourceVertices, pose, { indices: selection, include: true });
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
  private poseAnimationTime = 0;
  private animationPlaying = false;
  private animationCanBlend = false;
  private basePositions: Float32Array | null = null;
  private vertexGroups: number[][] = [];
  private sourceVertices: number[] = [];

  constructor(private renderable: Renderable, private reference: CacheRenderReference) {
    // Viewport3d filters scene roots before recursively raycasting children.
    // Mark this group as belonging to the renderable so its box hitbox is
    // considered as a click target.
    this.root.userData.clickable = renderable.selectable;
    this.root.userData.unit = renderable;
  }
  static forRenderable(renderable: Renderable, reference: CacheRenderReference) { return new CacheRenderModel(renderable, reference); }
  async animationChanged(id: number, blend: boolean) {
    if (ENABLE_CACHE_RENDER_ANIMATIONS) {
      // SDK callers use semantic pose indices (e.g. FireBow = 6), while the
      // bundle is keyed by the actual cache sequence ID (e.g. 426).
      this.activeAnimation = this.poseMap[String(id)] ?? id;
      this.animationTime = 0;
      this.animationPlaying = true;
      this.animationCanBlend = blend;
    }
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
    this.sourceVertices = [];
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
      if (this.animationPlaying && !this.animations[String(this.activeAnimation)]) {
        this.activeAnimation = this.poseMap[String(this.activeAnimation)] ?? this.activeAnimation;
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(payload.positions, 3));
      if (payload.uvs?.length === (payload.positions.length / 3) * 2) geometry.setAttribute("uv", new THREE.Float32BufferAttribute(payload.uvs, 2));
      if (payload.colors && payload.colors.length * 3 === payload.positions.length) {
        const colorValues: number[] = [];
        payload.colors.forEach((value) => { const color = new THREE.Color(value); colorValues.push(color.r, color.g, color.b); });
        geometry.setAttribute("color", new THREE.Float32BufferAttribute(colorValues, 3));
      }
      geometry.setIndex(payload.indices ?? []);
      geometry.computeVertexNormals();
      geometry.computeBoundingSphere();
      const materials: THREE.Material[] = [new THREE.MeshStandardMaterial({ color: payload.color ?? 0xffffff, vertexColors: Boolean(payload.colors?.length), flatShading: true })];
      const textureMaterial = new Map<number, number>();
      Object.entries(payload.textures ?? {}).forEach(([id, texture]) => {
        const rgba = new Uint8Array(texture.pixels.length * 4);
        texture.pixels.forEach((pixel, index) => { const value = pixel >>> 0; rgba[index * 4] = value >> 16 & 255; rgba[index * 4 + 1] = value >> 8 & 255; rgba[index * 4 + 2] = value & 255; rgba[index * 4 + 3] = value >> 24 & 255; });
        const image = new THREE.DataTexture(rgba, texture.width, texture.height, THREE.RGBAFormat); image.flipY = false; image.needsUpdate = true;
        textureMaterial.set(Number(id), materials.length); materials.push(new THREE.MeshStandardMaterial({ map: image, vertexColors: false, flatShading: true, transparent: true, alphaTest: 0.01 }));
      });
      if (payload.textureIds?.length) {
        geometry.clearGroups();
        for (let vertex = 0; vertex < payload.textureIds.length; vertex += 3) geometry.addGroup(vertex, 3, textureMaterial.get(payload.textureIds[vertex]) ?? 0);
      }
      const mesh = new THREE.Mesh(geometry, materials.length > 1 ? materials : materials[0]);
      this.basePositions = new Float32Array(payload.positions);
      this.vertexGroups = payload.vertexGroups ?? [];
      this.sourceVertices = payload.sourceVertices ?? Array.from({ length: payload.positions.length / 3 }, (_, index) => index);
      mesh.userData.clickable = this.renderable.selectable;
      mesh.userData.unit = this.renderable;
      mesh.userData.cacheAnimations = payload.animations ?? {};
      this.root.add(mesh);
      // Keep targeting reliable even when the decoded model has sparse or
      // unusual triangles. The viewport raycasts recursively, so this simple
      // tile-sized volume is enough to select the NPC and trigger attacks.
      const hitbox = new THREE.Mesh(
        new THREE.BoxGeometry((this.renderable.clickboxRadius ?? this.renderable.size * 0.4) * 2, this.renderable.clickboxHeight ?? this.renderable.size, (this.renderable.clickboxRadius ?? this.renderable.size * 0.4) * 2),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
      );
      hitbox.position.y = (this.renderable.clickboxHeight ?? this.renderable.size) / 2 - 0.49;
      hitbox.userData.clickable = this.renderable.selectable;
      hitbox.userData.unit = this.renderable;
      this.root.add(hitbox);
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
    if (pose !== this.lastPose) this.poseAnimationTime = 0;
    else this.poseAnimationTime += clockDelta;
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
        this.animationCanBlend = false;
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
          const poseSequence = this.poseMap[String(pose)];
          const poseAnimation = this.animations[String(poseSequence)];
          const interleave = animation.interleaveLeave?.filter((index) => index !== 9999999) ?? [];
          if (this.animationPlaying && this.animationCanBlend && interleave.length && poseAnimation?.rawFrames?.length) {
            // This is the legacy client's animate2 ordering. The primary
            // (attack) sequence controls every non-interleaved transform slot;
            // poseAnimation supplies the interleaved slots (normally legs).
            // Origin transforms run in both passes and each pass has its own
            // pivot state.
            const poseTotal = poseAnimation.lengths.reduce((sum, length) => sum + length, 0) / 50;
            const poseTime = poseTotal > 0 ? this.poseAnimationTime % poseTotal : 0;
            let poseElapsed = 0, poseFrame = 0;
            for (; poseFrame < poseAnimation.lengths.length - 1 && poseTime >= poseElapsed + poseAnimation.lengths[poseFrame] / 50; poseFrame++) poseElapsed += poseAnimation.lengths[poseFrame] / 50;
            applyBlendedRawFrames(transformed, this.vertexGroups, this.sourceVertices, animation.rawFrames[frame], poseAnimation.rawFrames[poseFrame] ?? poseAnimation.rawFrames[0], interleave);
          } else applyRawFrame(transformed, this.vertexGroups, this.sourceVertices, animation.rawFrames[frame]);
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
