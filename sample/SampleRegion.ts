import {
  CardinalDirection,
  Player,
  Region,
} from "../src";
import { CACHE_ASSETS } from "../src";
import type { Loadout as LoadoutData } from "../src";
import { SampleNpc } from "./SampleNpc";
import { SampleDummy } from "./SampleDummy";
import { SampleAnimayaNpc } from "./SampleAnimayaNpc";
import { SampleScene } from "./SampleScene";

export class SampleRegion extends Region {
  constructor(loadouts: LoadoutData[]) {
    super(loadouts);
  }

  get initialFacing() {
    return CardinalDirection.NORTH;
  }

  // The cache-composed scene supplies its own terrain. Keep the legacy
  // minimap-textured floor available only for the explicit GLB comparison.
  drawDefaultFloor() {
    return new URLSearchParams(window.location.search).get("static-scene") === "1";
  }

  getName() {
    return "Sample";
  }

  get width(): number {
    return 51;
  }

  get height(): number {
    return 57;
  }

  initialiseRegion(): { player: Player } {
    const player = new Player(this, {
      x: 25,
      y: 25,
    });
    this.addPlayer(player);

    this.addMob(new SampleNpc(this, { x: 25, y: 20 }, {}));
    this.addMob(new SampleDummy(this, { x: 34, y: 28 }, {}));
    this.addMob(new SampleAnimayaNpc(this, { x: 15, y: 25 }, {}));

    // The cache scene uses raw region-local tile coordinates. Retain the
    // legacy GLB anchor only when explicitly requested for comparison.
    this.addEntity(new SampleScene(this, { x: 0, y: new URLSearchParams(window.location.search).get("static-scene") === "1" ? 48 : 0 }));

    return { player };
  }
}
