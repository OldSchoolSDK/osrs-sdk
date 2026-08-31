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

/**
 * Draws a cache-extracted region as individual object placements. Geometry is
 * grouped by asset through CacheRenderInstancedModel; only the tile transforms
 * remain individual. This is the intentional intermediate stage before the
 * asset pipeline emits a stitched terrain/scene mesh.
 */
export class CacheRenderSceneModel implements Model {
  private ready: Promise<void> | null = null;
  private models: Array<{ placement: CacheRenderScenePlacement; model: CacheRenderInstancedModel }> = [];
  private worldPosition = new THREE.Vector3();
  private destroyed = false;

  // Depth bias handles opaque coplanar faces. Keep a microscopic physical gap
  // as well for transparent shadow geometry, whose blend/depth ordering is
  // not fully resolved by polygon offset under logarithmic depth buffering.
  private static readonly TERRAIN_HEIGHT_OFFSET = -0.002;

  constructor(private readonly sceneId: string) {}

  private async ensureLoaded() {
    if (this.ready) return this.ready;
    this.ready = (async () => {
      const bundle = await CacheRender.bundle();
      const recipe = bundle.manifest.scenes?.[this.sceneId];
      if (!recipe) throw new Error(`Bundle has no static scene recipe for ${this.sceneId}`);
      const mirrorY = recipe.mirrorY === true;
      const height = recipe.height ?? 64;
      const placements = recipe.placements.map((placement): CacheRenderScenePlacement => {
        // Terrain is a single region-sized payload and has its own authored
        // transform; only mirror individual object tile placements here.
        return placement.assetId.endsWith("-terrain") || !mirrorY
          ? placement
          : { ...placement, y: height - 1 - placement.y };
      });
      // Fetch/decode each geometry payload once. Constructing and reserving
      // every placement here made SDK readiness wait for thousands of wrapper
      // allocations even though CacheRenderInstancedModel already shares the
      // GPU pool by asset. Per-tile instances are intentionally allocated on
      // the first rendered frame instead.
      const preloadModels = new Map<string, CacheRenderInstancedModel>();
      placements.forEach((placement) => {
        if (!preloadModels.has(placement.assetId)) {
          preloadModels.set(placement.assetId, new CacheRenderInstancedModel(
            new ScenePlacement(placement),
            CacheRenderReferences.asset(placement.assetId),
          ));
        }
      });
      await Promise.all(Array.from(preloadModels.values()).map((model) => model.preload()));
      preloadModels.forEach((model) => model.destroy(new THREE.Scene()));
      this.models = placements.map((placement) => ({
        placement,
        model: new CacheRenderInstancedModel(new ScenePlacement(placement), CacheRenderReferences.asset(placement.assetId)),
      }));
    })();
    return this.ready;
  }

  draw(scene: THREE.Scene, clockDelta: number, tickPercent: number, location: Location3, _angleRadians: number, _pitchRadians: number, visible: boolean, _modelOffsets: Location3[]) {
    this.ensureLoaded().then(() => {
      if (this.destroyed) return;
      this.worldPosition.set(location.x, location.z, location.y);
      this.models.forEach(({ placement, model }) => {
        const terrain = placement.assetId.endsWith("-terrain");
        model.draw(scene, clockDelta, tickPercent, {
          // Cache locations are the south-west tile of an object footprint;
          // cache models are centred on that footprint. The instancer adds the
          // normal half-tile centre for a 1x1 model, so add only the extra
          // footprint extent here. Mirrored scene Y is already applied above.
          x: location.x + placement.x + ((placement.width ?? 1) - 1) / 2,
          y: location.y + placement.y - ((placement.height ?? 1) - 1) / 2,
          z: location.z + placement.plane + (terrain ? CacheRenderSceneModel.TERRAIN_HEIGHT_OFFSET : 0),
          // ObjectDefinition.getModel has already baked each location's cache
          // orientation. The recipe transform changes only its tile placement;
          // rotating the mesh again reverses walls/decorations in-place.
          // CacheRenderInstancedModel adds +PI/2 for actor-facing models. Scene
          // object orientations are already baked by ObjectDefinition.getModel,
          // so cancel that actor offset for objects. Terrain was pre-rotated for
          // the generic instancer and must retain the zero rotation path.
        }, terrain ? 0 : -Math.PI / 2, 0, visible, [{ x: 0, y: 0, z: 0 }]);
      });
    }).catch((error) => console.error("[osrs-sdk] Cache scene preload failed", error));
  }

  destroy(scene: THREE.Scene) {
    this.destroyed = true;
    this.models.forEach(({ model }) => model.destroy(scene));
  }

  getWorldPosition() { return this.worldPosition; }
  async preload() { await this.ensureLoaded(); }
}
