import * as THREE from "three";
import { Location3 } from "../Location";
import { Renderable, RenderableListener } from "../Renderable";
import { CacheRender, CacheRenderBundleError } from "./CacheRenderBundle";
import { CacheRenderReference } from "./CacheRenderReference";
import { Model } from "./Model";

const MAGIC = "OSRB";
type Payload = { version: 1; positions: number[]; indices?: number[]; normals?: number[]; color?: number; animations?: Record<string, { duration: number }> };

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

  constructor(private renderable: Renderable, private reference: CacheRenderReference) { }
  static forRenderable(renderable: Renderable, reference: CacheRenderReference) { return new CacheRenderModel(renderable, reference); }
  async animationChanged(id: number, _blend: boolean) { this.activeAnimation = id; return Promise.resolve(); }
  modelChanged() { /* loadouts create a new model through Renderable.invalidateModel */ }
  async preload() { await this.ensureLoaded(); }

  private async ensureLoaded() {
    if (this.ready) return this.ready;
    this.ready = (async () => {
      const bundle = await CacheRender.bundle();
      const payloads = await Promise.all(bundle.assetIds(this.reference).map(async id => decodeCacheRenderPayload(await bundle.fetchAsset(id))));
      payloads.forEach((payload) => {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.Float32BufferAttribute(payload.positions, 3));
        if (payload.normals) geometry.setAttribute("normal", new THREE.Float32BufferAttribute(payload.normals, 3)); else geometry.computeVertexNormals();
        if (payload.indices) geometry.setIndex(payload.indices);
        geometry.computeBoundingSphere();
        const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: payload.color ?? 0xffffff, flatShading: !payload.normals }));
        mesh.userData.clickable = this.renderable.selectable;
        mesh.userData.unit = this.renderable;
        this.root.add(mesh);
        this.mesh ??= mesh;
      });
    })();
    return this.ready;
  }
  draw(scene: THREE.Scene, _clockDelta: number, _tickPercent: number, location: Location3, rotation: number, pitch: number, visible: boolean, modelOffsets: Location3[]) {
    this.ensureLoaded().catch(() => { /* caller can retain its GLTF fallback; rendering must not crash the viewport */ });
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
    this.lastPose = this.renderable.animationIndex;
  }
  destroy(scene: THREE.Scene) { if (this.root.parent === scene) scene.remove(this.root); this.renderable.clearAnimationListener(); }
  getWorldPosition() { return this.root.getWorldPosition(new THREE.Vector3()); }
}
