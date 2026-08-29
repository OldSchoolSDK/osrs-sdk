import * as THREE from "three";
import { Location3 } from "../Location";
import { Renderable, RenderableListener } from "../Renderable";
import { CacheRender, CacheRenderBundleError } from "./CacheRenderBundle";
import { CacheRenderReference } from "./CacheRenderReference";
import { Model } from "./Model";

const MAGIC = "OSRB";
type AnimationPayload = { frames: number[][]; lengths: number[] };
type Payload = { version: 1; positions: number[]; indices?: number[]; normals?: number[]; color?: number; animations?: Record<string, AnimationPayload>; poseMap?: Record<string, number> };

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

  constructor(private renderable: Renderable, private reference: CacheRenderReference) { }
  static forRenderable(renderable: Renderable, reference: CacheRenderReference) { return new CacheRenderModel(renderable, reference); }
  async animationChanged(id: number, _blend: boolean) { this.activeAnimation = id; this.animationTime = 0; this.animationPlaying = true; return Promise.resolve(); }
  modelChanged() {
    const next = this.renderable.get3dModel();
    const nextPrimary = (next as any)?.getPrimaryModel?.();
    if (next instanceof CacheRenderModel && next !== this) this.reference = next.reference;
    else if (nextPrimary instanceof CacheRenderModel) this.reference = nextPrimary.reference;
    this.ready = null;
    this.mesh = null;
    this.animations = {};
    this.poseMap = {};
    this.root.clear();
  }
  async preload() { await this.ensureLoaded(); }

  private async ensureLoaded() {
    if (this.ready) return this.ready;
    this.ready = (async () => {
      const bundle = await CacheRender.bundle();
      const payloads = await Promise.all(bundle.assetIds(this.reference).map(async id => decodeCacheRenderPayload(await bundle.fetchAsset(id))));
      payloads.forEach((payload) => {
        Object.assign(this.animations, payload.animations ?? {});
        Object.assign(this.poseMap, payload.poseMap ?? {});
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.Float32BufferAttribute(payload.positions, 3));
        if (payload.normals) geometry.setAttribute("normal", new THREE.Float32BufferAttribute(payload.normals, 3)); else geometry.computeVertexNormals();
        if (payload.indices) geometry.setIndex(payload.indices);
        geometry.computeBoundingSphere();
        const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: payload.color ?? 0xffffff, flatShading: !payload.normals }));
        mesh.userData.clickable = this.renderable.selectable;
        mesh.userData.unit = this.renderable;
        mesh.userData.cacheAnimations = payload.animations ?? {};
        this.root.add(mesh);
        this.mesh ??= mesh;
      });
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
      this.root.children.forEach((child: THREE.Mesh) => {
        const childAnimation = child.userData.cacheAnimations?.[String(this.activeAnimation)] ?? animation;
        const childVertices = childAnimation.frames[frame] ?? vertices;
        const childNextVertices = childAnimation.frames[next] ?? nextVertices;
        const position = child.geometry.getAttribute("position") as THREE.BufferAttribute;
        if (position.count * 3 !== childVertices.length) return;
        for (let i = 0; i < childVertices.length; i++) position.array[i] = childVertices[i] + (childNextVertices[i] - childVertices[i]) * blend;
        position.needsUpdate = true;
        child.geometry.computeVertexNormals();
      });
    }
    this.lastPose = pose;
  }
  destroy(scene: THREE.Scene) { if (this.root.parent === scene) scene.remove(this.root); this.renderable.clearAnimationListener(); }
  getWorldPosition() { return this.root.getWorldPosition(new THREE.Vector3()); }
}
