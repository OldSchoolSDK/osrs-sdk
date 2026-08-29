import * as THREE from "three";
import { Location3 } from "../Location";
import { Model } from "./Model";

/** Uses the cache model after its verified preload succeeds, otherwise keeps a legacy model live. */
export class FallbackModel implements Model {
  private active: Model | null = null;
  private attempted = false;
  private fallbackWasDrawn = false;
  constructor(private primary: Model, private fallback: Model) {}
  getPrimaryModel() { return this.primary; }
  private select() {
    if (this.attempted) return;
    this.attempted = true;
    this.primary.preload().then(() => { this.active = this.primary; }).catch((error) => {
      console.error("[osrs-sdk] Cache render unavailable; using GLTF fallback", error);
      this.active = this.fallback;
    });
  }
  draw(scene: THREE.Scene, clockDelta: number, tickPercent: number, location: Location3, rotation: number, pitch: number, visible: boolean, modelOffsets: Location3[]) {
    this.select();
    // The legacy model is intentionally drawn while bundle validation is in flight.
    const model = this.active ?? this.fallback;
    if (model === this.primary && this.fallbackWasDrawn) this.fallback.destroy(scene);
    if (model === this.fallback) this.fallbackWasDrawn = true;
    model.draw(scene, clockDelta, tickPercent, location, rotation, pitch, visible, modelOffsets);
  }
  destroy(scene: THREE.Scene) { this.primary.destroy(scene); this.fallback.destroy(scene); }
  getWorldPosition(): THREE.Vector3 { return (this.active ?? this.fallback).getWorldPosition(); }
  async preload() { this.select(); await (this.active ?? this.fallback).preload(); }
}
