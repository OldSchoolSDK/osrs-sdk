import * as THREE from "three";
import { Location, Location3 } from "../Location";
import { Renderable } from "../Renderable";
import { CacheRender, CacheRenderScenePlacement } from "./CacheRenderBundle";
import { CacheRenderInstancedModel } from "./CacheRenderInstancedModel";
import { CacheRenderReferences } from "./CacheRenderReference";
import { Model } from "./Model";

class ScenePlacement extends Renderable {
  constructor(private readonly placement: CacheRenderScenePlacement) { super(); }
  getPerceivedLocation(_tickPercent: number): Location3 { return { x: this.placement.x, y: this.placement.y, z: this.placement.plane }; }
  getPerceivedRotation(_tickPercent: number) { return 0; }
  getTrueLocation(): Location { return { x: this.placement.x, y: this.placement.y }; }
  get size() { return 1; }
  get color() { return "#000000"; }
  get animationIndex() { return -1; }
  shouldDestroy() { return false; }
  get selectable() { return false; }
}

/** Draws asset-pipeline-compiled static scene meshes. */
export class CacheRenderSceneModel implements Model {
  private ready: Promise<void> | null = null;
  private models: CacheRenderInstancedModel[] = [];
  private worldPosition = new THREE.Vector3();
  private destroyed = false;

  constructor(private readonly sceneId: string) {}

  private async ensureLoaded() {
    if (this.ready) return this.ready;
    this.ready = (async () => {
      const bundle = await CacheRender.bundle();
      const recipe = bundle.manifest.scenes?.[this.sceneId];
      if (!recipe) throw new Error(`Bundle has no static scene recipe for ${this.sceneId}`);
      const assetIds = Object.values(recipe.compiledAssets ?? {});
      if (!assetIds.length) throw new Error(`Scene ${this.sceneId} has no compiled geometry`);
      const placement: CacheRenderScenePlacement = { assetId: "compiled-scene", x: 0, y: 0, plane: 0 };
      this.models = assetIds.map((assetId) => {
        // we only want 1 instance of this (in fact, should we even be using instances for this?)
        return new CacheRenderInstancedModel(new ScenePlacement(placement), CacheRenderReferences.asset(assetId), 1);
      });
      await Promise.all(this.models.map((model) => model.preload()));
    })();
    return this.ready;
  }

  draw(scene: THREE.Scene, clockDelta: number, tickPercent: number, location: Location3, _angleRadians: number, _pitchRadians: number, visible: boolean, _modelOffsets: Location3[]) {
    this.ensureLoaded().then(() => {
      if (this.destroyed) return;
      this.worldPosition.set(location.x, location.z, location.y);
      this.models.forEach((model) => {
        model.draw(scene, clockDelta, tickPercent, {
          x: location.x, y: location.y, z: location.z,
        // The compiler bakes object and terrain orientation, so cancel the
        // instancer's actor-facing +90-degree rotation once for the whole scene.
        }, -Math.PI / 2, 0, visible, [{ x: 0, y: 0, z: 0 }]);
      });
    }).catch((error) => console.error("[osrs-sdk] Cache scene preload failed", error));
  }

  destroy(scene: THREE.Scene) {
    this.destroyed = true;
    this.models.forEach((model) => model.destroy(scene));
  }

  getWorldPosition() { return this.worldPosition; }
  async preload() { await this.ensureLoaded(); }
}
