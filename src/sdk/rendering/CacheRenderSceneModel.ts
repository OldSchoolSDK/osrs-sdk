import * as THREE from "three";
import { Location3 } from "../Location";
import { CacheRender } from "./CacheRenderBundle";
import { cachedPayload } from "./CacheRenderModel";
import { Model } from "./Model";

/** Renders pipeline-compiled static scene meshes (opaque + transparent). */
export class CacheRenderSceneModel implements Model {
  private ready: Promise<void> | null = null;
  private root = new THREE.Group();
  private worldPosition = new THREE.Vector3();
  private destroyed = false;
  constructor(private readonly sceneId: string) {}
  private async ensureLoaded() {
    if (this.ready) return this.ready;
    this.ready = (async () => {
      const bundle = await CacheRender.bundle(); const recipe = bundle.manifest.scenes?.[this.sceneId];
      if (!recipe) throw new Error(`Bundle has no static scene recipe for ${this.sceneId}`);
      for (const [kind, assetId] of Object.entries(recipe.compiledAssets)) {
        if (!assetId) continue;
        const chunks = (await cachedPayload(bundle, assetId)).chunks ?? [];
        if (!chunks.length) throw new Error(`Compiled scene asset ${assetId} has no chunks`);
        const material = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, flatShading: true, transparent: kind === "transparent", alphaTest: 0.01 });
        chunks.forEach((chunk) => {
          const geometry = new THREE.BufferGeometry(); geometry.setAttribute("position", new THREE.Float32BufferAttribute(chunk.positions, 3));
          const colors: number[] = [];
          chunk.colors.forEach((value, index) => { const color = new THREE.Color(value); colors.push(color.r, color.g, color.b, 1 - (chunk.alphas[index] & 255) / 255); });
          geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 4)); geometry.setIndex(chunk.indices); geometry.computeVertexNormals();
          this.root.add(new THREE.Mesh(geometry, material));
        });
      }
    })(); return this.ready;
  }
  draw(scene: THREE.Scene, _clockDelta: number, _tickPercent: number, location: Location3, _angleRadians: number, _pitchRadians: number, visible: boolean, _modelOffsets: Location3[]) {
    this.ensureLoaded().then(() => { if (this.destroyed) return; if (this.root.parent !== scene) scene.add(this.root); this.root.position.set(location.x + .5, location.z - .49, location.y - .5); this.root.visible = visible; this.worldPosition.set(location.x, location.z, location.y); }).catch((error) => console.error("[osrs-sdk] Compiled cache scene failed", error));
  }
  destroy(scene: THREE.Scene) { this.destroyed = true; scene.remove(this.root); this.root.traverse((object: any) => { if (object.isMesh) { object.geometry.dispose(); object.material.dispose(); } }); }
  getWorldPosition() { return this.worldPosition; }
  async preload() { await this.ensureLoaded(); }
}
