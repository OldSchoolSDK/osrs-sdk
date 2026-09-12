import {
  CardinalDirection,
  Manticore,
  Player,
  Region,
} from "../src";
import type { Loadout as LoadoutData } from "../src";
import { SampleNpc } from "./SampleNpc";
import { SampleDummy } from "./SampleDummy";
import { SampleAnimayaNpc } from "./SampleAnimayaNpc";
import { SampleScene } from "./SampleScene";
import { JavelinColossus } from "./JavelinColossus";
import { SampleSmallNpc } from "./SampleSmallNpc";

export class SampleRegion extends Region {
  constructor(loadouts: LoadoutData[]) {
    super(loadouts);
  }

  get initialFacing() {
    return CardinalDirection.NORTH;
  }

  drawDefaultFloor() {
    return false;
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

    const sampleNpc = new SampleNpc(this, { x: 25, y: 20 }, {});
    this.addMob(sampleNpc);
    this.setBoss(sampleNpc);
    this.addEntity(new SampleDummy(this, { x: 34, y: 28 }));
    this.addMob(new SampleAnimayaNpc(this, { x: 15, y: 25 }, { aggro: player }));
    this.addMob(new Manticore(this, { x: 25, y: 24 }));
    this.addMob(new JavelinColossus(this, { x: 28, y: 24 }));
    this.addMob(new SampleSmallNpc(this, { x: 28, y: 25 }));
    this.addMob(new SampleSmallNpc(this, { x: 29, y: 25 }));

    this.addEntity(new SampleScene(this, { x: 0, y: 0 }));

    return { player };
  }
}
